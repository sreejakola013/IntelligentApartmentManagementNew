
from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, jsonify, request
from pymongo import DESCENDING
import jwt
import os

from database import db

notifications_bp = Blueprint(
    "notifications",
    __name__,
    url_prefix="/api/notifications",
)

notifications_collection = db["notifications"]
users_collection = db["users"]


def current_user():
    """Validate the JWT and return the logged-in user."""
    header = request.headers.get("Authorization", "")

    if not header.startswith("Bearer "):
        return None, (
            jsonify({"message": "Authentication required."}),
            401,
        )

    token = header.split(" ", 1)[1]

    try:
        payload = jwt.decode(
            token,
            os.getenv("SECRET_KEY"),
            algorithms=["HS256"],
        )

        user_id = payload.get("user_id")

        if not user_id or not ObjectId.is_valid(user_id):
            raise ValueError("Invalid user ID")

        user = users_collection.find_one(
            {"_id": ObjectId(user_id)}
        )

        if not user:
            raise ValueError("User not found")

        return user, None

    except Exception as exc:
        print("DEBUG authentication error:", str(exc))
        return None, (
            jsonify({"message": "Invalid or expired token."}),
            401,
        )


def create_notification(
    recipient_id,
    title,
    message,
    category="GENERAL",
    related_id=None,
):
    """Save a notification for one user in MongoDB."""
    if not ObjectId.is_valid(str(recipient_id)):
        raise ValueError("Invalid notification recipient ID.")

    notification = {
        "recipient_id": ObjectId(str(recipient_id)),
        "title": str(title),
        "message": str(message),
        "category": str(category),
        "related_id": str(related_id) if related_id else None,
        "is_read": False,
        "created_at": datetime.now(timezone.utc),
    }

    result = notifications_collection.insert_one(notification)
    notification["_id"] = result.inserted_id

    return notification


def format_notification(notification):
    created_at = notification.get("created_at")

    return {
        "id": str(notification["_id"]),
        "title": notification.get("title", ""),
        "message": notification.get("message", ""),
        "category": notification.get("category", "GENERAL"),
        "related_id": notification.get("related_id"),
        "is_read": notification.get("is_read", False),
        "created_at": (
            created_at.isoformat() if created_at else None
        ),
    }


@notifications_bp.route("", methods=["GET"])
def get_notifications():
    user, error = current_user()

    if error:
        return error

    # DEBUG 1: Confirm the database and collection used by this route.
    print("\n========== NOTIFICATION DEBUG ==========")
    print("DEBUG database:", db.name)
    print("DEBUG collection:", notifications_collection.name)
    print("DEBUG current user ID:", str(user["_id"]))
    print("DEBUG current user role:", user.get("role"))

    # DEBUG 2: Count all notifications in this database.
    total_count = notifications_collection.count_documents({})
    print("DEBUG total notifications:", total_count)

    # DEBUG 3: Count notifications belonging to the logged-in user.
    user_query = {"recipient_id": user["_id"]}

    user_count = notifications_collection.count_documents(
        user_query
    )
    print("DEBUG notifications for current user:", user_count)

    # DEBUG 4: Check whether the specific fire/smoke notification exists.
    fire_notification_id = "6acd1c9b8383cc3e8bce9e86"

    fire_exists = notifications_collection.count_documents({
        "_id": ObjectId(fire_notification_id)
    })

    print("DEBUG fire notification exists:", fire_exists)

    # DEBUG 5: Check whether that notification belongs to this user.
    fire_for_user = notifications_collection.count_documents({
        "_id": ObjectId(fire_notification_id),
        "recipient_id": user["_id"],
    })

    print("DEBUG fire notification belongs to current user:", fire_for_user)

    # Retrieve notifications for the current user.
    limit = request.args.get("limit", default=50, type=int)
    limit = max(1, min(limit, 100))

    items = list(
        notifications_collection.find(user_query)
        .sort("created_at", DESCENDING)
        .limit(limit)
    )

    # DEBUG 6: Check whether the fire alert was included in the result.
    returned_fire_alert = any(
        str(item["_id"]) == fire_notification_id
        for item in items
    )

    print("DEBUG fire alert included in GET result:", returned_fire_alert)
    print("DEBUG notifications returned:", len(items))
    print("========== END NOTIFICATION DEBUG ==========\n")

    unread_count = notifications_collection.count_documents({
        "recipient_id": user["_id"],
        "is_read": False,
    })

    return jsonify({
        "notifications": [
            format_notification(item) for item in items
        ],
        "unread_count": unread_count,
    }), 200


@notifications_bp.route("/<notification_id>/read", methods=["PATCH"])
def mark_notification_read(notification_id):
    user, error = current_user()

    if error:
        return error

    if not ObjectId.is_valid(notification_id):
        return jsonify({
            "message": "Invalid notification ID."
        }), 400

    result = notifications_collection.update_one(
        {
            "_id": ObjectId(notification_id),
            "recipient_id": user["_id"],
        },
        {"$set": {"is_read": True}},
    )

    if result.matched_count == 0:
        return jsonify({
            "message": "Notification not found."
        }), 404

    return jsonify({
        "message": "Notification marked as read."
    }), 200


@notifications_bp.route("/read-all", methods=["PATCH"])
def mark_all_notifications_read():
    user, error = current_user()

    if error:
        return error

    result = notifications_collection.update_many(
        {
            "recipient_id": user["_id"],
            "is_read": False,
        },
        {"$set": {"is_read": True}},
    )

    return jsonify({
        "message": "All notifications marked as read.",
        "updated_count": result.modified_count,
    }), 200
