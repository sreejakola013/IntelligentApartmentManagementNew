
from datetime import datetime, timezone

import os
import jwt
from bson import ObjectId
from flask import Blueprint, jsonify, request
from pymongo import DESCENDING

from database import db

visitors_bp = Blueprint(
    "visitors",
    __name__,
    url_prefix="/api/visitors"
)

visitors_collection = db["visitors"]
users_collection = db["users"]
notifications_collection = db["notifications"]


def get_current_user():
    header = request.headers.get("Authorization", "")

    if not header.startswith("Bearer "):
        return None, (jsonify({
            "message": "Authentication required."
        }), 401)

    token = header.split(" ", 1)[1]

    try:
        payload = jwt.decode(
            token,
            os.getenv("SECRET_KEY"),
            algorithms=["HS256"]
        )

        user_id = payload.get("user_id")

        if not user_id or not ObjectId.is_valid(user_id):
            raise ValueError("Invalid user ID")

        user = users_collection.find_one({
            "_id": ObjectId(user_id)
        })

        if not user:
            raise ValueError("User not found")

        return user, None

    except Exception:
        return None, (jsonify({
            "message": "Invalid or expired token."
        }), 401)


def create_notification(recipient_id, title, message):
    """Save a notification for an existing user."""
    try:
        if not recipient_id:
            return

        notifications_collection.insert_one({
            "recipient_id": ObjectId(str(recipient_id)),
            "title": title,
            "message": message,
            "category": "VISITOR",
            "related_id": None,
            "is_read": False,
            "created_at": datetime.now(timezone.utc)
        })
    except Exception:
        # A notification failure should not undo a visitor operation.
        pass


def format_visitor(visitor):
    return {
        "id": str(visitor["_id"]),
        "visitor_name": visitor.get("visitor_name", ""),
        "phone": visitor.get("phone", ""),
        "purpose": visitor.get("purpose", ""),
        "expected_at": visitor.get("expected_at"),
        "resident_id": str(visitor.get("resident_id", "")),
        "resident_name": visitor.get("resident_name", ""),
        "status": visitor.get("status", "EXPECTED"),
        "created_at": (
            visitor["created_at"].isoformat()
            if visitor.get("created_at")
            else None
        ),
        "check_in_at": (
            visitor["check_in_at"].isoformat()
            if visitor.get("check_in_at")
            else None
        ),
        "check_out_at": (
            visitor["check_out_at"].isoformat()
            if visitor.get("check_out_at")
            else None
        )
    }


def role_of(user):
    return str(user.get("role", "")).upper()


def notify_admins(title, message):
    for admin in users_collection.find({
        "role": {"$in": ["ADMIN", "admin", "Admin"]}
    }):
        create_notification(admin["_id"], title, message)


@visitors_bp.route("", methods=["POST"])
def register_visitor():
    user, error = get_current_user()
    if error:
        return error

    role = role_of(user)

    if role not in ["RESIDENT", "ADMIN"]:
        return jsonify({
            "message": "Only residents and admins can register visitors."
        }), 403

    data = request.get_json(silent=True) or {}

    visitor_name = str(data.get("visitor_name", "")).strip()
    phone = str(data.get("phone", "")).strip()
    purpose = str(data.get("purpose", "")).strip()
    expected_at = str(data.get("expected_at", "")).strip()

    if not visitor_name or not phone or not purpose or not expected_at:
        return jsonify({
            "message": "Visitor name, phone, purpose and expected time are required."
        }), 400

    if len(visitor_name) > 100 or len(phone) > 30 or len(purpose) > 300:
        return jsonify({
            "message": "One or more fields exceed the allowed length."
        }), 400

    try:
        # Validate that the expected time is a valid ISO date/time.
        parsed_time = datetime.fromisoformat(
            expected_at.replace("Z", "+00:00")
        )
        if parsed_time.tzinfo is None:
            parsed_time = parsed_time.replace(tzinfo=timezone.utc)

        expected_at = parsed_time.isoformat()

    except ValueError:
        return jsonify({
            "message": "Invalid expected time. Use an ISO date/time."
        }), 400

    resident_id = user["_id"]
    resident_name = (
        user.get("name")
        or user.get("full_name")
        or user.get("username")
        or user.get("email")
        or "Resident"
    )

    # Admins can register a visitor for a specific resident.
    if role == "ADMIN" and data.get("resident_id"):
        target_id = str(data["resident_id"])

        if not ObjectId.is_valid(target_id):
            return jsonify({
                "message": "Invalid resident ID."
            }), 400

        target_resident = users_collection.find_one({
            "_id": ObjectId(target_id),
            "role": {"$in": ["RESIDENT", "resident", "Resident"]}
        })

        if not target_resident:
            return jsonify({
                "message": "Resident not found."
            }), 404

        resident_id = target_resident["_id"]
        resident_name = (
            target_resident.get("name")
            or target_resident.get("full_name")
            or target_resident.get("username")
            or target_resident.get("email")
            or "Resident"
        )

    visitor = {
        "visitor_name": visitor_name,
        "phone": phone,
        "purpose": purpose,
        "expected_at": expected_at,
        "resident_id": resident_id,
        "resident_name": resident_name,
        "status": "EXPECTED",
        "created_at": datetime.now(timezone.utc),
        "check_in_at": None,
        "check_out_at": None
    }

    result = visitors_collection.insert_one(visitor)
    visitor["_id"] = result.inserted_id

    notify_admins(
        "Expected visitor registered",
        f"{visitor_name} is expected to visit {resident_name}."
    )

    return jsonify({
        "message": "Visitor registered successfully.",
        "visitor": format_visitor(visitor)
    }), 201


@visitors_bp.route("", methods=["GET"])
def get_visitors():
    user, error = get_current_user()
    if error:
        return error

    role = role_of(user)

    if role in ["ADMIN", "SECURITY"]:
        query = {}
    elif role == "RESIDENT":
        query = {"resident_id": user["_id"]}
    else:
        return jsonify({
            "message": "You are not allowed to view visitor records."
        }), 403

    status = request.args.get("status", "").upper()

    if status:
        allowed_statuses = ["EXPECTED", "CHECKED_IN", "CHECKED_OUT"]
        if status not in allowed_statuses:
            return jsonify({
                "message": "Invalid visitor status."
            }), 400
        query["status"] = status

    visitors = list(
        visitors_collection.find(query)
        .sort("created_at", DESCENDING)
        .limit(200)
    )

    return jsonify({
        "visitors": [format_visitor(v) for v in visitors],
        "count": len(visitors)
    }), 200


@visitors_bp.route("/<visitor_id>/check-in", methods=["PATCH"])
def check_in_visitor(visitor_id):
    user, error = get_current_user()
    if error:
        return error

    if role_of(user) not in ["ADMIN", "SECURITY"]:
        return jsonify({
            "message": "Only security staff or admins can record visitor entry."
        }), 403

    if not ObjectId.is_valid(visitor_id):
        return jsonify({"message": "Invalid visitor ID."}), 400

    visitor = visitors_collection.find_one({
        "_id": ObjectId(visitor_id)
    })

    if not visitor:
        return jsonify({"message": "Visitor not found."}), 404

    if visitor.get("status") != "EXPECTED":
        return jsonify({
            "message": "Only expected visitors can be checked in."
        }), 409

    now = datetime.now(timezone.utc)

    result = visitors_collection.update_one(
        {
            "_id": visitor["_id"],
            "status": "EXPECTED"
        },
        {
            "$set": {
                "status": "CHECKED_IN",
                "check_in_at": now
            }
        }
    )

    if result.modified_count == 0:
        return jsonify({
            "message": "Visitor status changed. Refresh and try again."
        }), 409

    create_notification(
        visitor["resident_id"],
        "Visitor has arrived",
        f"{visitor.get('visitor_name', 'Your visitor')} has checked in."
    )

    return jsonify({
        "message": "Visitor checked in successfully."
    }), 200


@visitors_bp.route("/<visitor_id>/check-out", methods=["PATCH"])
def check_out_visitor(visitor_id):
    user, error = get_current_user()
    if error:
        return error

    if role_of(user) not in ["ADMIN", "SECURITY"]:
        return jsonify({
            "message": "Only security staff or admins can record visitor exit."
        }), 403

    if not ObjectId.is_valid(visitor_id):
        return jsonify({"message": "Invalid visitor ID."}), 400

    now = datetime.now(timezone.utc)

    result = visitors_collection.update_one(
        {
            "_id": ObjectId(visitor_id),
            "status": "CHECKED_IN"
        },
        {
            "$set": {
                "status": "CHECKED_OUT",
                "check_out_at": now
            }
        }
    )

    if result.matched_count == 0:
        existing = visitors_collection.find_one({
            "_id": ObjectId(visitor_id)
        })

        if not existing:
            return jsonify({"message": "Visitor not found."}), 404

        return jsonify({
            "message": "Only checked-in visitors can be checked out."
        }), 409

    visitor = visitors_collection.find_one({
        "_id": ObjectId(visitor_id)
    })

    create_notification(
        visitor["resident_id"],
        "Visitor has left",
        f"{visitor.get('visitor_name', 'Your visitor')} has checked out."
    )

    return jsonify({
        "message": "Visitor checked out successfully."
    }), 200
