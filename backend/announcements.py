
import os
from datetime import datetime, timezone

import jwt
from bson import ObjectId
from flask import Blueprint, jsonify, request
from pymongo import DESCENDING

from database import db

announcements_bp = Blueprint(
    "announcements",
    __name__,
    url_prefix="/api/announcements"
)

announcements_collection = db["announcements"]
users_collection = db["users"]
notifications_collection = db["notifications"]


def get_current_user():
    header = request.headers.get("Authorization", "")

    if not header.startswith("Bearer "):
        return None, (jsonify({
            "message": "Authentication required."
        }), 401)

    try:
        token = header.split(" ", 1)[1]
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


def user_role(user):
    return str(user.get("role", "")).upper()


def format_announcement(item):
    created_at = item.get("created_at")

    return {
        "id": str(item["_id"]),
        "title": item.get("title", ""),
        "description": item.get("description", ""),
        "category": item.get("category", "GENERAL"),
        "created_by": item.get("created_by", ""),
        "created_at": (
            created_at.isoformat() if created_at else None
        )
    }


def notify_residents(title, announcement_title):
    now = datetime.now(timezone.utc)

    for resident in users_collection.find({
        "role": {
            "$in": ["RESIDENT", "resident", "Resident"]
        }
    }):
        notifications_collection.insert_one({
            "recipient_id": resident["_id"],
            "title": title,
            "message": (
                f"New announcement: {announcement_title}"
            ),
            "category": "ANNOUNCEMENT",
            "related_id": None,
            "is_read": False,
            "created_at": now
        })


@announcements_bp.route("", methods=["POST"])
def create_announcement():
    user, error = get_current_user()
    if error:
        return error

    if user_role(user) != "ADMIN":
        return jsonify({
            "message": "Only admins can publish announcements."
        }), 403

    data = request.get_json(silent=True) or {}

    title = str(data.get("title", "")).strip()
    description = str(data.get("description", "")).strip()
    category = str(
        data.get("category", "GENERAL")
    ).strip().upper()

    allowed_categories = [
        "GENERAL",
        "MAINTENANCE",
        "WATER_SUPPLY",
        "MEETING",
        "EVENT",
        "EMERGENCY"
    ]

    if not title or not description:
        return jsonify({
            "message": "Title and description are required."
        }), 400

    if len(title) > 150 or len(description) > 3000:
        return jsonify({
            "message": "Title or description is too long."
        }), 400

    if category not in allowed_categories:
        return jsonify({
            "message": "Invalid announcement category."
        }), 400

    admin_name = (
        user.get("name")
        or user.get("full_name")
        or user.get("username")
        or user.get("email")
        or "Admin"
    )

    announcement = {
        "title": title,
        "description": description,
        "category": category,
        "created_by": admin_name,
        "created_by_id": user["_id"],
        "created_at": datetime.now(timezone.utc)
    }

    result = announcements_collection.insert_one(announcement)
    announcement["_id"] = result.inserted_id

    try:
        notify_residents(title, title)
    except Exception:
        # Keep the announcement saved even if notifications fail.
        pass

    return jsonify({
        "message": "Announcement published successfully.",
        "announcement": format_announcement(announcement)
    }), 201


@announcements_bp.route("", methods=["GET"])
def get_announcements():
    user, error = get_current_user()
    if error:
        return error

    allowed_roles = [
        "ADMIN", "RESIDENT", "SECURITY", "MAINTENANCE"
    ]

    if user_role(user) not in allowed_roles:
        return jsonify({
            "message": "You are not allowed to view announcements."
        }), 403

    items = list(
        announcements_collection.find()
        .sort("created_at", DESCENDING)
        .limit(200)
    )

    return jsonify({
        "announcements": [
            format_announcement(item) for item in items
        ],
        "count": len(items)
    }), 200


@announcements_bp.route("/<announcement_id>", methods=["DELETE"])
def delete_announcement(announcement_id):
    user, error = get_current_user()
    if error:
        return error

    if user_role(user) != "ADMIN":
        return jsonify({
            "message": "Only admins can delete announcements."
        }), 403

    if not ObjectId.is_valid(announcement_id):
        return jsonify({
            "message": "Invalid announcement ID."
        }), 400

    result = announcements_collection.delete_one({
        "_id": ObjectId(announcement_id)
    })

    if result.deleted_count == 0:
        return jsonify({
            "message": "Announcement not found."
        }), 404

    return jsonify({
        "message": "Announcement deleted successfully."
    }), 200
