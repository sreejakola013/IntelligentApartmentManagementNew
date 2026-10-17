
import os
import base64
from datetime import datetime, timezone
from functools import wraps

import cv2
import jwt
import numpy as np
from bson import ObjectId
from flask import Blueprint, request, jsonify, current_app
from ultralytics import YOLO

from database import db


# ---------------------------------------------------------
# BLUEPRINT AND CONFIGURATION
# ---------------------------------------------------------

ai_bp = Blueprint(
    "ai_monitoring",
    __name__,
    url_prefix="/api/ai"
)

model = None
fire_model = None

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "bmp"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024

history_collection = db["ai_monitoring_history"]
notifications_collection = db["notifications"]
users_collection = db["users"]

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

OBJECT_MODEL_PATH = os.path.join(
    BACKEND_DIR,
    "yolov8n.pt"
)

FIRE_MODEL_PATH = os.path.join(
    BACKEND_DIR,
    "fire_smoke.pt"
)


# ---------------------------------------------------------
# AUTHENTICATION
# Only ADMIN and SECURITY can use AI monitoring.
# ---------------------------------------------------------

def admin_or_security_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")

        if not auth_header.startswith("Bearer "):
            return jsonify({
                "message": "Please log in first."
            }), 401

        token = auth_header.split(" ", 1)[1].strip()
        secret_key = os.getenv("SECRET_KEY")

        if not secret_key:
            return jsonify({
                "message": "Server authentication is not configured."
            }), 500

        try:
            payload = jwt.decode(
                token,
                secret_key,
                algorithms=["HS256"]
            )

        except jwt.ExpiredSignatureError:
            return jsonify({
                "message": "Session expired. Please log in again."
            }), 401

        except jwt.InvalidTokenError:
            return jsonify({
                "message": "Invalid login token."
            }), 401

        role = str(payload.get("role", "")).upper()

        if role not in {"ADMIN", "SECURITY"}:
            return jsonify({
                "message": (
                    "Only administrators and security staff "
                    "can use AI monitoring."
                )
            }), 403

        request.ai_user = {
            "user_id": str(payload.get("user_id", "")),
            "role": role
        }

        return function(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------
# GENERAL OBJECT DETECTION MODEL
# ---------------------------------------------------------

def get_model():
    global model

    if model is None:
        if not os.path.isfile(OBJECT_MODEL_PATH):
            raise FileNotFoundError(
                "Object detection model yolov8n.pt was not found "
                "inside the backend folder."
            )

        model = YOLO(OBJECT_MODEL_PATH)

    return model


# ---------------------------------------------------------
# FIRE/SMOKE DETECTION MODEL
# ---------------------------------------------------------

def get_fire_model():
    global fire_model

    if fire_model is None:
        if not os.path.isfile(FIRE_MODEL_PATH):
            raise FileNotFoundError(
                "Fire/smoke model not found. Place "
                "fire_smoke.pt inside the backend folder."
            )

        fire_model = YOLO(FIRE_MODEL_PATH)

    return fire_model


# ---------------------------------------------------------
# SHARED IMAGE VALIDATION
# ---------------------------------------------------------

def read_uploaded_image():
    if "image" not in request.files:
        return None, jsonify({
            "message": (
                "Upload an image using the field name 'image'."
            )
        }), 400

    file = request.files["image"]

    if not file.filename:
        return None, jsonify({
            "message": "No image selected."
        }), 400

    extension = file.filename.rsplit(".", 1)[-1].lower()

    if extension not in ALLOWED_EXTENSIONS:
        return None, jsonify({
            "message": "Use JPG, JPEG, PNG or BMP images."
        }), 400

    image_bytes = file.read(MAX_IMAGE_SIZE + 1)

    if not image_bytes:
        return None, jsonify({
            "message": "The uploaded image is empty."
        }), 400

    if len(image_bytes) > MAX_IMAGE_SIZE:
        return None, jsonify({
            "message": "Image must be 10 MB or smaller."
        }), 413

    image_array = np.frombuffer(
        image_bytes,
        dtype=np.uint8
    )

    image = cv2.imdecode(
        image_array,
        cv2.IMREAD_COLOR
    )

    if image is None:
        return None, jsonify({
            "message": "The uploaded file is not a valid image."
        }), 400

    return image, None, None


# ---------------------------------------------------------
# IMAGE ENCODING
# ---------------------------------------------------------

def encode_annotated_image(image):
    success, encoded_image = cv2.imencode(
        ".jpg",
        image
    )

    if not success:
        raise RuntimeError(
            "Could not create the annotated image."
        )

    image_base64 = base64.b64encode(
        encoded_image.tobytes()
    ).decode("utf-8")

    return f"data:image/jpeg;base64,{image_base64}"


# ---------------------------------------------------------
# SAVE AI HISTORY RECORD
# Positive fire/smoke alerts start as PENDING.
# ---------------------------------------------------------

def save_history_record(
    detection_type,
    image,
    detections,
    alert_level=None
):
    history_record = {
        "detection_type": detection_type,
        "user_id": request.ai_user["user_id"],
        "user_role": request.ai_user["role"],
        "created_at": datetime.now(timezone.utc),
        "image_width": int(image.shape[1]),
        "image_height": int(image.shape[0]),
        "object_count": len(detections),
        "detections": detections
    }

    if alert_level is not None:
        history_record["alert_level"] = alert_level

    if (
        detection_type == "fire_smoke"
        and alert_level in {
            "FIRE_DETECTED",
            "SMOKE_DETECTED"
        }
    ):
        history_record.update({
            "response_status": "PENDING",
            "acknowledged_by": None,
            "acknowledged_at": None,
            "resolved_by": None,
            "resolved_at": None
        })

    result = history_collection.insert_one(history_record)

    current_app.logger.info(
        "AI %s scan saved with ID %s",
        detection_type,
        result.inserted_id
    )

    return str(result.inserted_id)


# ---------------------------------------------------------
# CREATE FIRE/SMOKE NOTIFICATIONS
# Notify all residents and SECURITY users.
# ---------------------------------------------------------

def create_fire_smoke_notification(
    alert_level,
    detections,
    history_id
):
    if alert_level not in {
        "FIRE_DETECTED",
        "SMOKE_DETECTED"
    }:
        return []

    if alert_level == "FIRE_DETECTED":
        title = "Fire Alert"
        message = (
            "A possible fire was detected in an uploaded image. "
            "Please stay alert, avoid the affected area, and "
            "follow official emergency instructions. "
            "Security staff should verify the situation immediately."
        )
    else:
        title = "Smoke Alert"
        message = (
            "Possible smoke was detected in an uploaded image. "
            "Please stay alert, avoid the affected area, and "
            "follow official emergency instructions. "
            "Security staff should verify the situation immediately."
        )

    recipients = users_collection.find({
        "role": {
            "$regex": "^(SECURITY|RESIDENT|RESIDENTS)$",
            "$options": "i"
        }
    })

    notification_ids = []

    for recipient in recipients:
        notification = {
            "recipient_id": recipient["_id"],
            "title": title,
            "message": message,
            "category": "SECURITY",
            "related_id": str(history_id),
            "is_read": False,
            "created_at": datetime.now(timezone.utc)
        }

        result = notifications_collection.insert_one(notification)
        notification_ids.append(str(result.inserted_id))

    current_app.logger.warning(
        "AI ALERT: %s; notifications created: %s; history ID: %s",
        alert_level,
        len(notification_ids),
        history_id
    )

    return notification_ids


# ---------------------------------------------------------
# OBJECT DETECTION
# POST /api/ai/detect
# ---------------------------------------------------------

@ai_bp.route("/detect", methods=["POST"])
@admin_or_security_required
def detect_objects():
    image, error_response, status_code = read_uploaded_image()

    if error_response is not None:
        return error_response, status_code

    try:
        detector = get_model()

        results = detector.predict(
            source=image,
            conf=0.35,
            verbose=False
        )

        detections = []

        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0].item())
                confidence = float(box.conf[0].item())
                coordinates = box.xyxy[0].tolist()

                detections.append({
                    "label": str(result.names[class_id]),
                    "confidence": round(confidence, 4),
                    "box": [
                        round(float(value), 2)
                        for value in coordinates
                    ]
                })

        annotated_image = results[0].plot()
        image_data = encode_annotated_image(annotated_image)

        history_id = save_history_record(
            detection_type="objects",
            image=image,
            detections=detections
        )

        return jsonify({
            "message": (
                "Object detection completed and history saved."
            ),
            "history_id": history_id,
            "detection_type": "objects",
            "image_width": int(image.shape[1]),
            "image_height": int(image.shape[0]),
            "count": len(detections),
            "detections": detections,
            "annotated_image": image_data
        }), 200

    except Exception:
        current_app.logger.exception(
            "YOLO object detection or history saving failed"
        )

        return jsonify({
            "message": (
                "Object detection or history saving failed. "
                "Check the backend terminal."
            )
        }), 500


# ---------------------------------------------------------
# AI HISTORY
# GET /api/ai/history
# ---------------------------------------------------------

@ai_bp.route("/history", methods=["GET"])
@admin_or_security_required
def get_ai_history():
    try:
        records = list(
            history_collection.find(
                {},
                {
                    "_id": 1,
                    "detection_type": 1,
                    "user_id": 1,
                    "user_role": 1,
                    "created_at": 1,
                    "image_width": 1,
                    "image_height": 1,
                    "object_count": 1,
                    "detections": 1,
                    "alert_level": 1,
                    "response_status": 1,
                    "acknowledged_by": 1,
                    "acknowledged_at": 1,
                    "resolved_by": 1,
                    "resolved_at": 1
                }
            )
            .sort("created_at", -1)
            .limit(100)
        )

        total_scans = history_collection.count_documents({})

        object_scan_filter = {
            "detection_type": {"$ne": "fire_smoke"}
        }

        summary = list(
            history_collection.aggregate([
                {"$match": object_scan_filter},
                {
                    "$group": {
                        "_id": None,
                        "total_objects": {
                            "$sum": {
                                "$ifNull": ["$object_count", 0]
                            }
                        }
                    }
                }
            ])
        )

        total_objects = (
            summary[0]["total_objects"] if summary else 0
        )

        fire_smoke_filter = {
            "detection_type": "fire_smoke"
        }

        total_fire_smoke_scans = (
            history_collection.count_documents(fire_smoke_filter)
        )

        fire_smoke_summary = list(
            history_collection.aggregate([
                {"$match": fire_smoke_filter},
                {
                    "$group": {
                        "_id": None,
                        "total_fire_smoke_detections": {
                            "$sum": {
                                "$ifNull": ["$object_count", 0]
                            }
                        },
                        "fire_alerts": {
                            "$sum": {
                                "$cond": [
                                    {"$eq": ["$alert_level", "FIRE_DETECTED"]},
                                    1,
                                    0
                                ]
                            }
                        },
                        "smoke_alerts": {
                            "$sum": {
                                "$cond": [
                                    {"$eq": ["$alert_level", "SMOKE_DETECTED"]},
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                }
            ])
        )

        fire_smoke_totals = (
            fire_smoke_summary[0]
            if fire_smoke_summary
            else {
                "total_fire_smoke_detections": 0,
                "fire_alerts": 0,
                "smoke_alerts": 0
            }
        )

        scans = []

        for record in records:
            created_at = record.get("created_at")

            scans.append({
                "id": str(record["_id"]),
                "detection_type": record.get("detection_type", "objects"),
                "user_id": record.get("user_id", ""),
                "user_role": record.get("user_role", "UNKNOWN"),
                "created_at": (
                    created_at.isoformat()
                    if hasattr(created_at, "isoformat")
                    else None
                ),
                "image_width": record.get("image_width", 0),
                "image_height": record.get("image_height", 0),
                "object_count": record.get("object_count", 0),
                "detections": record.get("detections", []),
                "alert_level": record.get("alert_level"),
                "response_status": record.get("response_status"),
                "acknowledged_by": record.get("acknowledged_by"),
                "acknowledged_at": (
                    record["acknowledged_at"].isoformat()
                    if hasattr(record.get("acknowledged_at"), "isoformat")
                    else None
                ),
                "resolved_by": record.get("resolved_by"),
                "resolved_at": (
                    record["resolved_at"].isoformat()
                    if hasattr(record.get("resolved_at"), "isoformat")
                    else None
                )
            })

        return jsonify({
            "total_scans": total_scans,
            "total_objects": total_objects,
            "total_fire_smoke_scans": total_fire_smoke_scans,
            "total_fire_smoke_detections": (
                fire_smoke_totals.get("total_fire_smoke_detections", 0)
            ),
            "fire_alerts": fire_smoke_totals.get("fire_alerts", 0),
            "smoke_alerts": fire_smoke_totals.get("smoke_alerts", 0),
            "scans_returned": len(scans),
            "scans": scans
        }), 200

    except Exception:
        current_app.logger.exception(
            "Could not retrieve AI monitoring history"
        )

        return jsonify({
            "message": "Could not load AI monitoring history."
        }), 500


# ---------------------------------------------------------
# FIRE AND SMOKE DETECTION
# POST /api/ai/fire-smoke-detect
# ---------------------------------------------------------

@ai_bp.route("/fire-smoke-detect", methods=["POST"])
@admin_or_security_required
def detect_fire_smoke():
    image, error_response, status_code = read_uploaded_image()

    if error_response is not None:
        return error_response, status_code

    try:
        detector = get_fire_model()

        results = detector.predict(
            source=image,
            conf=0.25,
            verbose=False
        )

        detections = []

        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0].item())
                confidence = float(box.conf[0].item())
                label = str(result.names[class_id]).lower()

                if "fire" not in label and "smoke" not in label:
                    continue

                coordinates = box.xyxy[0].tolist()

                detections.append({
                    "label": label,
                    "confidence": round(confidence, 4),
                    "box": [
                        round(float(value), 2)
                        for value in coordinates
                    ]
                })

        annotated_image = results[0].plot()
        image_data = encode_annotated_image(annotated_image)

        fire_found = any(
            "fire" in item["label"] for item in detections
        )

        smoke_found = any(
            "smoke" in item["label"] for item in detections
        )

        if fire_found:
            alert_level = "FIRE_DETECTED"
        elif smoke_found:
            alert_level = "SMOKE_DETECTED"
        else:
            alert_level = "NO_FIRE_OR_SMOKE_DETECTED"

        history_id = save_history_record(
            detection_type="fire_smoke",
            image=image,
            detections=detections,
            alert_level=alert_level
        )

        notification_ids = create_fire_smoke_notification(
            alert_level=alert_level,
            detections=detections,
            history_id=history_id
        )

        return jsonify({
            "message": "Fire/smoke image analysis completed.",
            "history_id": history_id,
            "notification_ids": notification_ids,
            "detection_type": "fire_smoke",
            "alert_level": alert_level,
            "image_width": int(image.shape[1]),
            "image_height": int(image.shape[0]),
            "count": len(detections),
            "detections": detections,
            "annotated_image": image_data
        }), 200

    except Exception:
        current_app.logger.exception(
            "Fire/smoke detection failed"
        )

        return jsonify({
            "message": (
                "Fire/smoke detection failed. Check the backend "
                "terminal and confirm fire_smoke.pt is valid."
            )
        }), 500


# ---------------------------------------------------------
# FIRE/SMOKE ALERT SERIALIZATION
# ---------------------------------------------------------

def serialize_fire_alert(record):
    def format_datetime(value):
        return value.isoformat() if hasattr(value, "isoformat") else None

    return {
        "id": str(record["_id"]),
        "detection_type": record.get("detection_type"),
        "alert_level": record.get("alert_level"),
        "response_status": record.get("response_status", "PENDING"),
        "created_at": format_datetime(record.get("created_at")),
        "detections": record.get("detections", []),
        "object_count": record.get("object_count", 0),
        "acknowledged_by": record.get("acknowledged_by"),
        "acknowledged_at": format_datetime(record.get("acknowledged_at")),
        "resolved_by": record.get("resolved_by"),
        "resolved_at": format_datetime(record.get("resolved_at"))
    }


# ---------------------------------------------------------
# ADMIN/SECURITY FIRE ALERT MONITORING
# GET /api/ai/fire-smoke-alerts
# ---------------------------------------------------------

@ai_bp.route("/fire-smoke-alerts", methods=["GET"])
@admin_or_security_required
def get_fire_smoke_alerts():
    try:
        records = history_collection.find({
            "detection_type": "fire_smoke",
            "alert_level": {
                "$in": ["FIRE_DETECTED", "SMOKE_DETECTED"]
            }
        }).sort("created_at", -1).limit(200)

        alerts = [
            serialize_fire_alert(record)
            for record in records
        ]

        return jsonify({
            "total": len(alerts),
            "pending": sum(
                1 for alert in alerts
                if alert["response_status"] == "PENDING"
            ),
            "acknowledged": sum(
                1 for alert in alerts
                if alert["response_status"] == "ACKNOWLEDGED"
            ),
            "resolved": sum(
                1 for alert in alerts
                if alert["response_status"] == "RESOLVED"
            ),
            "alerts": alerts
        }), 200

    except Exception:
        current_app.logger.exception(
            "Could not load fire/smoke alerts"
        )

        return jsonify({
            "message": "Could not load fire/smoke alerts."
        }), 500


# ---------------------------------------------------------
# SECURITY ACKNOWLEDGES AN ALERT
# PATCH /api/ai/fire-smoke-alerts/<alert_id>/acknowledge
# ---------------------------------------------------------

@ai_bp.route(
    "/fire-smoke-alerts/<alert_id>/acknowledge",
    methods=["PATCH"]
)
@admin_or_security_required
def acknowledge_fire_smoke_alert(alert_id):
    if request.ai_user["role"] != "SECURITY":
        return jsonify({
            "message": "Only Security staff can acknowledge alerts."
        }), 403

    if not ObjectId.is_valid(alert_id):
        return jsonify({"message": "Invalid alert ID."}), 400

    now = datetime.now(timezone.utc)

    result = history_collection.update_one(
        {
            "_id": ObjectId(alert_id),
            "detection_type": "fire_smoke",
            "alert_level": {
                "$in": ["FIRE_DETECTED", "SMOKE_DETECTED"]
            },
            "$or": [
                {"response_status": "PENDING"},
                {"response_status": {"$exists": False}}
            ]
        },
        {
            "$set": {
                "response_status": "ACKNOWLEDGED",
                "acknowledged_by": request.ai_user["user_id"],
                "acknowledged_at": now
            }
        }
    )

    if result.modified_count == 0:
        existing = history_collection.find_one({
            "_id": ObjectId(alert_id),
            "detection_type": "fire_smoke",
            "alert_level": {
                "$in": ["FIRE_DETECTED", "SMOKE_DETECTED"]
            }
        })

        if existing is None:
            return jsonify({
                "message": "Fire/smoke alert not found."
            }), 404

        return jsonify({
            "message": (
                "This alert has already been acknowledged or resolved."
            )
        }), 409

    return jsonify({
        "message": "Fire/smoke alert acknowledged.",
        "response_status": "ACKNOWLEDGED",
        "acknowledged_at": now.isoformat()
    }), 200


# ---------------------------------------------------------
# SECURITY RESOLVES AN ACKNOWLEDGED ALERT
# PATCH /api/ai/fire-smoke-alerts/<alert_id>/resolve
# ---------------------------------------------------------

@ai_bp.route(
    "/fire-smoke-alerts/<alert_id>/resolve",
    methods=["PATCH"]
)
@admin_or_security_required
def resolve_fire_smoke_alert(alert_id):
    if request.ai_user["role"] != "SECURITY":
        return jsonify({
            "message": "Only Security staff can resolve alerts."
        }), 403

    if not ObjectId.is_valid(alert_id):
        return jsonify({"message": "Invalid alert ID."}), 400

    now = datetime.now(timezone.utc)

    result = history_collection.update_one(
        {
            "_id": ObjectId(alert_id),
            "detection_type": "fire_smoke",
            "alert_level": {
                "$in": ["FIRE_DETECTED", "SMOKE_DETECTED"]
            },
            "response_status": "ACKNOWLEDGED"
        },
        {
            "$set": {
                "response_status": "RESOLVED",
                "resolved_by": request.ai_user["user_id"],
                "resolved_at": now
            }
        }
    )

    if result.modified_count == 0:
        existing = history_collection.find_one({
            "_id": ObjectId(alert_id),
            "detection_type": "fire_smoke",
            "alert_level": {
                "$in": ["FIRE_DETECTED", "SMOKE_DETECTED"]
            }
        })

        if existing is None:
            return jsonify({
                "message": "Fire/smoke alert not found."
            }), 404

        return jsonify({
            "message": (
                "Only acknowledged alerts can be marked resolved."
            )
        }), 409

    return jsonify({
        "message": "Fire/smoke alert marked resolved.",
        "response_status": "RESOLVED",
        "resolved_at": now.isoformat()
    }), 200
