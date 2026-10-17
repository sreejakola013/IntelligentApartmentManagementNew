
import os
from datetime import datetime, timezone
from functools import wraps
from io import BytesIO

import jwt
import numpy as np
from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request
from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO

from database import db


animal_bp = Blueprint("animal_detection", __name__, url_prefix="/api/animals")

MODEL_PATH = os.path.join(os.path.dirname(__file__), "yolov8n.pt")
ANIMAL_CLASSES = {"cat", "dog"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024

# Load the existing model once, when this module is imported.
model = YOLO(MODEL_PATH)


def get_current_user():
    """Read and validate the current user's JWT."""
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ", 1)[1]

    try:
        payload = jwt.decode(
            token,
            current_app.config["SECRET_KEY"],
            algorithms=["HS256"],
        )
        user_id = payload.get("user_id")

        if not user_id or not ObjectId.is_valid(user_id):
            return None

        return db["users"].find_one({"_id": ObjectId(user_id)})

    except (jwt.InvalidTokenError, TypeError, ValueError):
        return None


def require_user(allowed_roles=None):
    """Protect an endpoint and optionally restrict roles."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user = get_current_user()

            if not user:
                return jsonify({
                    "success": False,
                    "message": "Please log in again."
                }), 401

            if allowed_roles:
                role = str(user.get("role", "")).upper()

                if role not in allowed_roles:
                    return jsonify({
                        "success": False,
                        "message": "You do not have permission to do this."
                    }), 403

            request.current_animal_user = user
            return func(*args, **kwargs)

        return wrapper
    return decorator


def serialize_detection(record):
    return {
        "id": str(record["_id"]),
        "animal": record.get("animal"),
        "confidence": record.get("confidence"),
        "bounding_box": record.get("bounding_box"),
        "verification_status": record.get(
            "verification_status", "UNCONFIRMED"
        ),
        "verified_by": record.get("verified_by"),
        "verification_note": record.get("verification_note", ""),
        "created_at": record.get("created_at").isoformat()
        if record.get("created_at") else None,
        "image_name": record.get("image_name"),
    }


@animal_bp.route("/detect", methods=["POST"])
@require_user({"ADMIN", "SECURITY"})
def detect_animals():
    """Detect cats and dogs in an uploaded image and save the results."""
    if "image" not in request.files:
        return jsonify({
            "success": False,
            "message": "Choose an image using the 'image' upload field."
        }), 400

    image_file = request.files["image"]

    if not image_file.filename:
        return jsonify({
            "success": False,
            "message": "No image was selected."
        }), 400

    image_bytes = image_file.read(MAX_IMAGE_SIZE + 1)

    if not image_bytes:
        return jsonify({
            "success": False,
            "message": "The uploaded image is empty."
        }), 400

    if len(image_bytes) > MAX_IMAGE_SIZE:
        return jsonify({
            "success": False,
            "message": "Image must be 10 MB or smaller."
        }), 413

    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        image_array = np.array(image)
    except (UnidentifiedImageError, OSError, ValueError):
        return jsonify({
            "success": False,
            "message": "Upload a valid JPG, PNG, or other supported image."
        }), 400

    try:
        results = model.predict(image_array, verbose=False)
    except Exception:
        current_app.logger.exception("Animal detection failed")
        return jsonify({
            "success": False,
            "message": "Animal detection failed. Check the model and dependencies."
        }), 500

    user = request.current_animal_user
    created_records = []

    for result in results:
        names = result.names

        if result.boxes is None:
            continue

        for box in result.boxes:
            class_id = int(box.cls[0].item())
            animal_name = str(names[class_id]).lower()

            if animal_name not in ANIMAL_CLASSES:
                continue

            confidence = round(float(box.conf[0].item()), 4)
            x1, y1, x2, y2 = [
                round(float(value), 2)
                for value in box.xyxy[0].tolist()
            ]

            record = {
                "animal": animal_name,
                "confidence": confidence,
                "bounding_box": {
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                },
                "verification_status": "UNCONFIRMED",
                "verified_by": None,
                "verification_note": "",
                "detected_by": user["_id"],
                "image_name": os.path.basename(image_file.filename),
                "created_at": datetime.now(timezone.utc),
            }

            insert_result = db["animal_detections"].insert_one(record)
            record["_id"] = insert_result.inserted_id
            created_records.append(serialize_detection(record))

    return jsonify({
        "success": True,
        "message": (
            f"Detected {len(created_records)} cat/dog instance(s)."
            if created_records
            else "No cats or dogs were detected in this image."
        ),
        "count": len(created_records),
        "detections": created_records,
    }), 200


@animal_bp.route("", methods=["GET"])
@require_user({"ADMIN", "SECURITY"})
def get_animal_detections():
    """List recent animal detections."""
    try:
        limit = min(max(int(request.args.get("limit", 100)), 1), 200)
    except ValueError:
        limit = 100

    records = list(
        db["animal_detections"]
        .find()
        .sort("created_at", -1)
        .limit(limit)
    )

    return jsonify({
        "success": True,
        "count": len(records),
        "detections": [serialize_detection(record) for record in records],
    }), 200


@animal_bp.route("/<detection_id>/verify", methods=["PATCH"])
@require_user({"ADMIN", "SECURITY"})
def verify_animal_detection(detection_id):
    """Allow staff to classify an animal sighting after human review."""
    if not ObjectId.is_valid(detection_id):
        return jsonify({
            "success": False,
            "message": "Invalid detection ID."
        }), 400

    data = request.get_json(silent=True) or {}
    status = str(data.get("verification_status", "")).upper()
    note = str(data.get("verification_note", "")).strip()[:500]

    allowed_statuses = {"STRAY", "PET", "UNCONFIRMED"}

    if status not in allowed_statuses:
        return jsonify({
            "success": False,
            "message": "Status must be STRAY, PET, or UNCONFIRMED."
        }), 400

    user = request.current_animal_user

    result = db["animal_detections"].update_one(
        {"_id": ObjectId(detection_id)},
        {
            "$set": {
                "verification_status": status,
                "verified_by": str(user["_id"]),
                "verification_note": note,
                "verified_at": datetime.now(timezone.utc),
            }
        },
    )

    if result.matched_count == 0:
        return jsonify({
            "success": False,
            "message": "Animal detection record not found."
        }), 404

    updated = db["animal_detections"].find_one({
        "_id": ObjectId(detection_id)
    })

    return jsonify({
        "success": True,
        "message": f"Animal sighting marked as {status}.",
        "detection": serialize_detection(updated),
    }), 200
