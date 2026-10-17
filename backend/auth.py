
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from database import db
from bson import ObjectId
import jwt
import os
import re
from datetime import datetime, timedelta, timezone

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

users = db["users"]

ALLOWED_ROLES = {"RESIDENT", "SECURITY", "MAINTENANCE"}


def create_token(user_id, role):
    return jwt.encode(
        {
            "user_id": str(user_id),
            "role": role,
            "exp": datetime.now(timezone.utc) + timedelta(hours=12)
        },
        os.getenv("SECRET_KEY", "dev-only-change-this-secret"),
        algorithm="HS256"
    )


def get_current_user():
    header = request.headers.get("Authorization", "")

    if not header.startswith("Bearer "):
        return None, (jsonify({
            "success": False,
            "message": "Authentication required"
        }), 401)

    try:
        token = header.split(" ", 1)[1]

        payload = jwt.decode(
            token,
            os.getenv("SECRET_KEY", "dev-only-change-this-secret"),
            algorithms=["HS256"]
        )

        user_id = payload.get("user_id")

        if not user_id or not ObjectId.is_valid(user_id):
            raise ValueError("Invalid user ID")

        user = users.find_one({"_id": ObjectId(user_id)})

        if not user:
            raise ValueError("User not found")

        return user, None

    except Exception:
        return None, (jsonify({
            "success": False,
            "message": "Invalid or expired token"
        }), 401)


def admin_required():
    user, error = get_current_user()

    if error:
        return None, error

    if str(user.get("role", "")).upper() != "ADMIN":
        return None, (jsonify({
            "success": False,
            "message": "Admin access required"
        }), 403)

    return user, None


def format_user(user):
    return {
        "id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "RESIDENT"),
        "created_at": (
            user["created_at"].isoformat()
            if user.get("created_at") else None
        )
    }


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    role = str(data.get("role", "RESIDENT")).strip().upper()

    if not name or not email or not isinstance(password, str):
        return jsonify({
            "success": False,
            "message": "Name, email and password are required"
        }), 400

    if len(password) < 8:
        return jsonify({
            "success": False,
            "message": "Password must contain at least 8 characters"
        }), 400

    if role not in ALLOWED_ROLES:
        return jsonify({
            "success": False,
            "message": "Invalid role. Contact an administrator for access."
        }), 400

    if users.find_one({"email": email}):
        return jsonify({
            "success": False,
            "message": "An account with this email already exists"
        }), 409

    user = {
        "name": name,
        "email": email,
        "password": generate_password_hash(password),
        "role": role,
        "created_at": datetime.now(timezone.utc)
    }

    result = users.insert_one(user)

    return jsonify({
        "success": True,
        "message": "Registration successful",
        "user": {
            "id": str(result.inserted_id),
            "name": name,
            "email": email,
            "role": role
        }
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")

    if not email or not isinstance(password, str) or not password:
        return jsonify({
            "success": False,
            "message": "Email and password are required"
        }), 400

    user = users.find_one({"email": email})

    if not user or not check_password_hash(user["password"], password):
        return jsonify({
            "success": False,
            "message": "Invalid email or password"
        }), 401

    token = create_token(user["_id"], user["role"])

    return jsonify({
        "success": True,
        "message": "Login successful",
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"],
            "role": user["role"]
        }
    }), 200


# ADMIN: list and search registered users
@auth_bp.route("/users", methods=["GET"])
def list_users():
    admin, error = admin_required()

    if error:
        return error

    query = {}

    search_text = request.args.get("search", "").strip()
    role = request.args.get("role", "").strip().upper()

    if search_text:
        safe_search = re.escape(search_text)
        query["$or"] = [
            {"name": {"$regex": safe_search, "$options": "i"}},
            {"email": {"$regex": safe_search, "$options": "i"}}
        ]

    if role:
        if role not in {"ADMIN", "RESIDENT", "SECURITY", "MAINTENANCE"}:
            return jsonify({
                "success": False,
                "message": "Invalid role filter"
            }), 400

        query["role"] = role

    records = list(
        users.find(query)
        .sort("created_at", -1)
        .limit(500)
    )

    return jsonify({
        "success": True,
        "count": len(records),
        "users": [format_user(user) for user in records]
    }), 200


# ADMIN: delete a user
@auth_bp.route("/users/<user_id>", methods=["DELETE"])
def delete_user(user_id):
    admin, error = admin_required()

    if error:
        return error

    if not ObjectId.is_valid(user_id):
        return jsonify({
            "success": False,
            "message": "Invalid user ID"
        }), 400

    target_id = ObjectId(user_id)

    if target_id == admin["_id"]:
        return jsonify({
            "success": False,
            "message": "You cannot delete your own Admin account"
        }), 400

    target = users.find_one({"_id": target_id})

    if not target:
        return jsonify({
            "success": False,
            "message": "User not found"
        }), 404

    users.delete_one({"_id": target_id})

    return jsonify({
        "success": True,
        "message": f"User {target.get('name', '')} deleted successfully"
    }), 200
