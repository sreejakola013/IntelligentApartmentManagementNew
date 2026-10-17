
import os
from datetime import datetime, timezone

import jwt
from bson import ObjectId
from flask import Blueprint, jsonify, request
from pymongo import DESCENDING

from database import db

dues_bp = Blueprint("dues", __name__, url_prefix="/api/dues")

dues_collection = db["dues"]
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


def get_role(user):
    return str(user.get("role", "")).upper()


def user_display_name(user):
    return (
        user.get("name")
        or user.get("full_name")
        or user.get("username")
        or user.get("email")
        or "Resident"
    )


def format_due(item):
    return {
        "id": str(item["_id"]),
        "resident_id": str(item["resident_id"]),
        "resident_name": item.get("resident_name", "Resident"),
        "title": item.get("title", ""),
        "description": item.get("description", ""),
        "amount": item.get("amount", 0),
        "due_date": item.get("due_date", ""),
        "status": item.get("status", "PENDING"),
        "created_at": (
            item["created_at"].isoformat()
            if item.get("created_at") else None
        ),
        "paid_at": (
            item["paid_at"].isoformat()
            if item.get("paid_at") else None
        )
    }


def notify_user(user_id, title, message):
    try:
        notifications_collection.insert_one({
            "recipient_id": user_id,
            "title": title,
            "message": message,
            "category": "DUES",
            "related_id": None,
            "is_read": False,
            "created_at": datetime.now(timezone.utc)
        })
    except Exception:
        pass


@dues_bp.route("", methods=["POST"])
def create_due():
    user, error = get_current_user()
    if error:
        return error

    if get_role(user) != "ADMIN":
        return jsonify({
            "message": "Only admins can create resident dues."
        }), 403

    data = request.get_json(silent=True) or {}

    resident_id = str(data.get("resident_id", "")).strip()
    title = str(data.get("title", "")).strip()
    description = str(data.get("description", "")).strip()
    due_date = str(data.get("due_date", "")).strip()

    try:
        amount = float(data.get("amount"))
    except (TypeError, ValueError):
        return jsonify({
            "message": "Enter a valid amount."
        }), 400

    if not resident_id or not ObjectId.is_valid(resident_id):
        return jsonify({
            "message": "A valid resident ID is required."
        }), 400

    if not title or not due_date:
        return jsonify({
            "message": "Title and due date are required."
        }), 400

    if len(title) > 150 or len(description) > 1000:
        return jsonify({
            "message": "Title or description is too long."
        }), 400

    if amount <= 0 or amount > 100000000:
        return jsonify({
            "message": "Amount must be greater than zero."
        }), 400

    try:
        # Accept a date such as 2026-11-01.
        datetime.strptime(due_date, "%Y-%m-%d")
    except ValueError:
        return jsonify({
            "message": "Due date must use YYYY-MM-DD format."
        }), 400

    resident = users_collection.find_one({
        "_id": ObjectId(resident_id),
        "role": {
            "$in": ["RESIDENT", "resident", "Resident"]
        }
    })

    if not resident:
        return jsonify({
            "message": "Resident not found."
        }), 404

    now = datetime.now(timezone.utc)

    due = {
        "resident_id": resident["_id"],
        "resident_name": user_display_name(resident),
        "title": title,
        "description": description,
        "amount": round(amount, 2),
        "due_date": due_date,
        "status": "PENDING",
        "created_at": now,
        "paid_at": None,
        "created_by": user["_id"]
    }

    result = dues_collection.insert_one(due)
    due["_id"] = result.inserted_id

    notify_user(
        resident["_id"],
        "New apartment dues",
        f"{title}: amount ₹{amount:.2f}, due by {due_date}."
    )

    return jsonify({
        "message": "Resident dues created successfully.",
        "due": format_due(due)
    }), 201


@dues_bp.route("", methods=["GET"])
def get_dues():
    user, error = get_current_user()
    if error:
        return error

    role = get_role(user)

    if role == "ADMIN":
        query = {}
    elif role == "RESIDENT":
        query = {"resident_id": user["_id"]}
    else:
        return jsonify({
            "message": "You are not allowed to view resident dues."
        }), 403

    status = request.args.get("status", "").upper()

    if status:
        if status not in ["PENDING", "PAID"]:
            return jsonify({
                "message": "Invalid dues status."
            }), 400
        query["status"] = status

    items = list(
        dues_collection.find(query)
        .sort("created_at", DESCENDING)
        .limit(500)
    )

    dues = [format_due(item) for item in items]

    return jsonify({
        "dues": dues,
        "count": len(dues),
        "total_pending": round(
            sum(d["amount"] for d in dues if d["status"] == "PENDING"),
            2
        ),
        "total_paid": round(
            sum(d["amount"] for d in dues if d["status"] == "PAID"),
            2
        )
    }), 200


@dues_bp.route("/<due_id>/confirm-payment", methods=["PATCH"])
def confirm_payment(due_id):
    user, error = get_current_user()
    if error:
        return error

    if get_role(user) != "ADMIN":
        return jsonify({
            "message": "Only admins can confirm payments."
        }), 403

    if not ObjectId.is_valid(due_id):
        return jsonify({
            "message": "Invalid dues ID."
        }), 400

    result = dues_collection.update_one(
        {
            "_id": ObjectId(due_id),
            "status": "PENDING"
        },
        {
            "$set": {
                "status": "PAID",
                "paid_at": datetime.now(timezone.utc),
                "confirmed_by": user["_id"]
            }
        }
    )

    if result.modified_count == 0:
        existing = dues_collection.find_one({
            "_id": ObjectId(due_id)
        })

        if not existing:
            return jsonify({
                "message": "Dues record not found."
            }), 404

        return jsonify({
            "message": "These dues have already been paid."
        }), 409

    due = dues_collection.find_one({
        "_id": ObjectId(due_id)
    })

    notify_user(
        due["resident_id"],
        "Payment confirmed",
        f"Your payment for {due['title']} has been confirmed."
    )

    return jsonify({
        "message": "Payment confirmed successfully."
    }), 200
