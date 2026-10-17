
from flask import Blueprint, request, jsonify
from database import db
from bson import ObjectId
from datetime import datetime, timezone
from ai_complaint_classifier import classify_complaint
import jwt
import os

complaints_bp = Blueprint(
    "complaints",
    __name__,
    url_prefix="/api/complaints"
)

complaints_collection = db["complaints"]
tasks_collection = db["maintenance_tasks"]
users_collection = db["users"]
notifications_collection = db["notifications"]


# -------------------- NOTIFICATIONS --------------------

def create_notification(
    recipient_id,
    title,
    message,
    category="GENERAL",
    related_id=None,
):
    """Store a notification for a specific user."""
    if not recipient_id or not ObjectId.is_valid(str(recipient_id)):
        return

    notifications_collection.insert_one({
        "recipient_id": ObjectId(str(recipient_id)),
        "title": title,
        "message": message,
        "category": category,
        "related_id": str(related_id) if related_id else None,
        "is_read": False,
        "created_at": datetime.now(timezone.utc),
    })


def notify_admins(title, message, category, related_id=None):
    """Notify all registered administrators."""
    admins = users_collection.find(
        {"role": "ADMIN"},
        {"_id": 1}
    )

    for admin in admins:
        create_notification(
            admin["_id"],
            title,
            message,
            category,
            related_id,
        )


# -------------------- AUTHENTICATION --------------------

def get_logged_in_user():
    authorization = request.headers.get("Authorization", "")

    if not authorization.startswith("Bearer "):
        return None, (
            jsonify({
                "success": False,
                "message": "Please log in first"
            }),
            401
        )

    token = authorization.split(" ", 1)[1]

    try:
        payload = jwt.decode(
            token,
            os.getenv(
                "SECRET_KEY",
                "dev-only-change-this-secret"
            ),
            algorithms=["HS256"]
        )
        return payload, None

    except jwt.ExpiredSignatureError:
        return None, (
            jsonify({
                "success": False,
                "message": "Your session has expired. Please log in again."
            }),
            401
        )

    except jwt.InvalidTokenError:
        return None, (
            jsonify({
                "success": False,
                "message": "Invalid login session. Please log in again."
            }),
            401
        )


def role_required(user, role):
    if user.get("role") != role:
        return jsonify({
            "success": False,
            "message": f"{role.title()} access required"
        }), 403

    return None


# -------------------- STATUS SYNCHRONIZATION --------------------

def update_linked_complaint(task, task_status):
    """
    Update the complaint linked to a maintenance task.

    New tasks should store complaint_id. For older tasks without that
    field, link automatically only when exactly one complaint matches
    the task title and category.
    """
    complaint_id = task.get("complaint_id")
    complaint = None

    if complaint_id and ObjectId.is_valid(str(complaint_id)):
        complaint = complaints_collection.find_one({
            "_id": ObjectId(str(complaint_id))
        })

    # Compatibility with older tasks that have no complaint_id.
    # Never guess when there are zero or multiple matching complaints.
    if not complaint and not complaint_id:
        candidates = list(
            complaints_collection.find({
                "title": task.get("title", ""),
                "category": task.get("category", "OTHER")
            }).limit(2)
        )

        if len(candidates) == 1:
            complaint = candidates[0]

            tasks_collection.update_one(
                {"_id": task["_id"]},
                {"$set": {
                    "complaint_id": str(complaint["_id"])
                }}
            )

    if not complaint:
        return False

    if task_status == "Completed":
        complaint_status = "Resolved"

    elif task_status == "In Progress":
        complaint_status = "In Progress"

    else:
        # Do not overwrite a resolved complaint when a task is assigned.
        if complaint.get("status") == "Resolved":
            return True

        complaint_status = "Pending"

    old_status = complaint.get("status", "Pending")

    if old_status == complaint_status:
        return True

    complaints_collection.update_one(
        {"_id": complaint["_id"]},
        {"$set": {
            "status": complaint_status,
            "updated_at": datetime.now(timezone.utc)
        }}
    )

    create_notification(
        complaint.get("user_id"),
        "Complaint Status Updated",
        f'Your complaint "{complaint.get("title", "")}" '
        f'has been updated to {complaint_status}.',
        "COMPLAINT",
        complaint["_id"],
    )

    return True


# -------------------- FORMATTERS --------------------

def format_complaint(complaint):
    created_at = complaint.get("created_at")
    updated_at = complaint.get("updated_at")
    ai_analysis = complaint.get("ai_analysis") or {}

    return {
        "id": str(complaint["_id"]),
        "title": complaint.get("title", ""),
        "description": complaint.get("description", ""),
        "category": complaint.get("category", ""),
        "status": complaint.get("status", "Pending"),
        "created_at": (
            created_at.isoformat() if created_at else None
        ),
        "updated_at": (
            updated_at.isoformat() if updated_at else None
        ),
        "user_name": complaint.get("user_name", ""),
        "ai_analysis": {
            "predicted_category": ai_analysis.get(
                "predicted_category", ""
            ),
            "priority": ai_analysis.get("priority", ""),
            "confidence": ai_analysis.get("confidence", 0),
            "reasons": ai_analysis.get("reasons", []),
            "suggested_action": ai_analysis.get(
                "suggested_action", ""
            ),
            "analyzed_at": (
                ai_analysis["analyzed_at"].isoformat()
                if ai_analysis.get("analyzed_at")
                else None
            ),
        } if ai_analysis else None,
    }


def format_task(task):
    created_at = task.get("created_at")
    updated_at = task.get("updated_at")

    return {
        "id": str(task["_id"]),
        "complaint_id": (
            str(task["complaint_id"])
            if task.get("complaint_id")
            else ""
        ),
        "title": task.get("title", ""),
        "description": task.get("description", ""),
        "category": task.get("category", "OTHER"),
        "status": task.get("status", "Assigned"),
        "due_date": task.get("due_date", ""),
        "assigned_to": task.get("assigned_to", ""),
        "assigned_to_name": task.get("assigned_to_name", ""),
        "assigned_to_email": task.get("assigned_to_email", ""),
        "assigned_by": task.get("assigned_by", ""),
        "created_at": (
            created_at.isoformat() if created_at else None
        ),
        "updated_at": (
            updated_at.isoformat() if updated_at else None
        )
    }


# -------------------- COMPLAINTS --------------------

@complaints_bp.route("", methods=["POST"])
def create_complaint():
    user, error = get_logged_in_user()

    if error:
        return error

    data = request.get_json(silent=True) or {}

    title = str(data.get("title", "")).strip()
    description = str(data.get("description", "")).strip()
    category = str(data.get("category", "")).strip().upper()

    allowed_categories = {
        "PLUMBING",
        "ELECTRICAL",
        "CLEANING",
        "SECURITY",
        "LIFT",
        "OTHER"
    }

    if not title or not description or not category:
        return jsonify({
            "success": False,
            "message": "Title, description and category are required"
        }), 400

    if len(title) > 120 or len(description) > 2000:
        return jsonify({
            "success": False,
            "message": (
                "Title must be at most 120 characters and "
                "description at most 2000"
            )
        }), 400

    if category not in allowed_categories:
        return jsonify({
            "success": False,
            "message": "Please select a valid complaint category"
        }), 400

    # -------- AI COMPLAINT CLASSIFICATION --------
    # Run classification inside the route, after validating the input.
    ai_result = classify_complaint(
        title=title,
        description=description,
        selected_category=category,
    )

    ai_analysis = {
        **ai_result,
        "analyzed_at": datetime.now(timezone.utc),
    }

    # -------- GET RESIDENT DETAILS --------
    user_id = str(user.get("user_id", ""))
    account = None

    if ObjectId.is_valid(user_id):
        account = users_collection.find_one(
            {"_id": ObjectId(user_id)},
            {"name": 1}
        )

    now = datetime.now(timezone.utc)

    # -------- SAVE COMPLAINT --------
    complaint = {
        "user_id": user_id,
        "user_name": account.get("name", "") if account else "",
        "title": title,
        "description": description,
        "category": category,
        "status": "Pending",
        "ai_analysis": ai_analysis,
        "created_at": now,
        "updated_at": now,
    }

    result = complaints_collection.insert_one(complaint)
    complaint["_id"] = result.inserted_id

    # -------- NOTIFY ADMINISTRATORS --------
    notify_admins(
        "New Complaint Submitted",
        f'{complaint["user_name"] or "A resident"} submitted: {title}. '
        f'AI priority recommendation: {ai_analysis["priority"]}.',
        "COMPLAINT",
        result.inserted_id,
    )

    return jsonify({
        "success": True,
        "message": "Complaint submitted and analyzed successfully",
        "complaint": format_complaint(complaint)
    }), 201


@complaints_bp.route("", methods=["GET"])
def get_my_complaints():
    user, error = get_logged_in_user()

    if error:
        return error

    records = complaints_collection.find(
        {"user_id": user.get("user_id", "")}
    ).sort("created_at", -1)

    return jsonify({
        "success": True,
        "complaints": [
            format_complaint(item) for item in records
        ]
    }), 200


@complaints_bp.route("/all", methods=["GET"])
def get_all_complaints():
    user, error = get_logged_in_user()

    if error:
        return error

    denied = role_required(user, "ADMIN")

    if denied:
        return denied

    records = complaints_collection.find().sort("created_at", -1)

    return jsonify({
        "success": True,
        "complaints": [
            format_complaint(item) for item in records
        ]
    }), 200


@complaints_bp.route("/<complaint_id>/status", methods=["PATCH"])
def update_complaint_status(complaint_id):
    user, error = get_logged_in_user()

    if error:
        return error

    denied = role_required(user, "ADMIN")

    if denied:
        return denied

    if not ObjectId.is_valid(complaint_id):
        return jsonify({
            "success": False,
            "message": "Invalid complaint ID"
        }), 400

    data = request.get_json(silent=True) or {}
    status = str(data.get("status", "")).strip()

    allowed_statuses = [
        "Pending",
        "In Progress",
        "Resolved"
    ]

    if status not in allowed_statuses:
        return jsonify({
            "success": False,
            "message": (
                "Status must be Pending, In Progress, or Resolved"
            )
        }), 400

    complaint = complaints_collection.find_one({
        "_id": ObjectId(complaint_id)
    })

    if not complaint:
        return jsonify({
            "success": False,
            "message": "Complaint not found"
        }), 404

    old_status = complaint.get("status", "Pending")

    complaints_collection.update_one(
        {"_id": ObjectId(complaint_id)},
        {"$set": {
            "status": status,
            "updated_at": datetime.now(timezone.utc)
        }}
    )

    if old_status != status:
        create_notification(
            complaint.get("user_id"),
            "Complaint Status Updated",
            f'Your complaint "{complaint.get("title", "")}" '
            f'has been updated to {status}.',
            "COMPLAINT",
            complaint_id,
        )

    return jsonify({
        "success": True,
        "message": "Complaint status updated successfully"
    }), 200


# -------------------- MAINTENANCE STAFF --------------------

@complaints_bp.route("/maintenance-users", methods=["GET"])
def get_maintenance_users():
    user, error = get_logged_in_user()

    if error:
        return error

    denied = role_required(user, "ADMIN")

    if denied:
        return denied

    records = users_collection.find(
        {"role": "MAINTENANCE"},
        {"name": 1, "email": 1, "role": 1}
    ).sort("name", 1)

    staff = []

    for person in records:
        staff.append({
            "id": str(person["_id"]),
            "name": person.get("name", ""),
            "email": person.get("email", ""),
            "role": person.get("role", "MAINTENANCE")
        })

    return jsonify({
        "success": True,
        "staff": staff
    }), 200


# -------------------- MAINTENANCE TASK ASSIGNMENT --------------------

@complaints_bp.route("/tasks", methods=["POST"])
def assign_maintenance_task():
    user, error = get_logged_in_user()

    if error:
        return error

    denied = role_required(user, "ADMIN")

    if denied:
        return denied

    data = request.get_json(silent=True) or {}

    title = str(data.get("title", "")).strip()
    description = str(data.get("description", "")).strip()
    category = str(data.get("category", "OTHER")).strip().upper()
    staff_id = str(data.get("assigned_to", "")).strip()
    due_date = str(data.get("due_date", "")).strip()
    complaint_id = str(data.get("complaint_id", "")).strip()

    allowed_categories = {
        "PLUMBING",
        "ELECTRICAL",
        "CLEANING",
        "LIFT",
        "OTHER"
    }

    if not title or not description or not staff_id:
        return jsonify({
            "success": False,
            "message": (
                "Title, description and assigned staff are required"
            )
        }), 400

    if len(title) > 120 or len(description) > 2000:
        return jsonify({
            "success": False,
            "message": "Title or description is too long"
        }), 400

    if category not in allowed_categories:
        return jsonify({
            "success": False,
            "message": "Invalid maintenance category"
        }), 400

    if not ObjectId.is_valid(staff_id):
        return jsonify({
            "success": False,
            "message": "Invalid maintenance staff ID"
        }), 400

    staff = users_collection.find_one({
        "_id": ObjectId(staff_id),
        "role": "MAINTENANCE"
    })

    if not staff:
        return jsonify({
            "success": False,
            "message": "Maintenance staff member not found"
        }), 404

    linked_complaint = None

    if complaint_id:
        if not ObjectId.is_valid(complaint_id):
            return jsonify({
                "success": False,
                "message": "Invalid complaint ID"
            }), 400

        linked_complaint = complaints_collection.find_one({
            "_id": ObjectId(complaint_id)
        })

        if not linked_complaint:
            return jsonify({
                "success": False,
                "message": "Linked complaint not found"
            }), 404

    else:
        # Legacy form compatibility: link only if there is exactly
        # one complaint with the same title and category.
        candidates = list(
            complaints_collection.find({
                "title": title,
                "category": category
            }).limit(2)
        )

        if len(candidates) == 1:
            linked_complaint = candidates[0]
            complaint_id = str(linked_complaint["_id"])

    now = datetime.now(timezone.utc)

    task = {
        "title": title,
        "description": description,
        "category": category,
        "status": "Assigned",
        "assigned_to": str(staff["_id"]),
        "assigned_to_name": staff.get("name", ""),
        "assigned_to_email": staff.get("email", ""),
        "assigned_by": str(user.get("user_id", "")),
        "due_date": due_date,
        "complaint_id": complaint_id or None,
        "created_at": now,
        "updated_at": now
    }

    result = tasks_collection.insert_one(task)
    task["_id"] = result.inserted_id

    # Notify assigned maintenance staff.
    create_notification(
        staff["_id"],
        "New Maintenance Task",
        f'You have been assigned: {title}.',
        "MAINTENANCE_TASK",
        result.inserted_id,
    )

    # If this task is linked to a complaint, reflect that work
    # has been assigned. Keep the resident informed.
    if linked_complaint:
        update_linked_complaint(task, "Assigned")

    return jsonify({
        "success": True,
        "message": "Maintenance task assigned successfully",
        "task": format_task(task)
    }), 201


@complaints_bp.route("/tasks", methods=["GET"])
def get_all_maintenance_tasks():
    user, error = get_logged_in_user()

    if error:
        return error

    denied = role_required(user, "ADMIN")

    if denied:
        return denied

    records = tasks_collection.find().sort("created_at", -1)

    return jsonify({
        "success": True,
        "tasks": [
            format_task(task) for task in records
        ]
    }), 200


@complaints_bp.route("/tasks/assigned", methods=["GET"])
def get_assigned_maintenance_tasks():
    user, error = get_logged_in_user()

    if error:
        return error

    denied = role_required(user, "MAINTENANCE")

    if denied:
        return denied

    records = tasks_collection.find({
        "assigned_to": user.get("user_id", "")
    }).sort("created_at", -1)

    return jsonify({
        "success": True,
        "tasks": [
            format_task(task) for task in records
        ]
    }), 200


@complaints_bp.route("/tasks/<task_id>/status", methods=["PATCH"])
def update_maintenance_task_status(task_id):
    user, error = get_logged_in_user()

    if error:
        return error

    denied = role_required(user, "MAINTENANCE")

    if denied:
        return denied

    if not ObjectId.is_valid(task_id):
        return jsonify({
            "success": False,
            "message": "Invalid task ID"
        }), 400

    data = request.get_json(silent=True) or {}
    status = str(data.get("status", "")).strip()

    allowed_statuses = [
        "Assigned",
        "In Progress",
        "Completed"
    ]

    if status not in allowed_statuses:
        return jsonify({
            "success": False,
            "message": (
                "Status must be Assigned, In Progress, or Completed"
            )
        }), 400

    task = tasks_collection.find_one({
        "_id": ObjectId(task_id),
        "assigned_to": user.get("user_id", "")
    })

    if not task:
        return jsonify({
            "success": False,
            "message": "Task not found or not assigned to you"
        }), 404

    old_status = task.get("status", "Assigned")

    result = tasks_collection.update_one(
        {
            "_id": ObjectId(task_id),
            "assigned_to": user.get("user_id", "")
        },
        {"$set": {
            "status": status,
            "updated_at": datetime.now(timezone.utc)
        }}
    )

    if result.matched_count == 0:
        return jsonify({
            "success": False,
            "message": "Task not found or not assigned to you"
        }), 404

    # Synchronize the linked complaint and notify its resident.
    update_linked_complaint(task, status)

    # Notify administrators when the task status changes.
    if old_status != status:
        notify_admins(
            "Maintenance Task Updated",
            f'{task.get("assigned_to_name", "Maintenance staff")} '
            f'updated "{task.get("title", "")}" to {status}.',
            "MAINTENANCE_TASK",
            task_id,
        )

    return jsonify({
        "success": True,
        "message": "Task status updated successfully"
    }), 200
