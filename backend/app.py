
import os

from flask import Flask, jsonify
from flask_cors import CORS

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "https://intelligent-apartment-management-d6gp0zymw-sreejakola013.vercel.app"
            ]
        }
    },
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
)
from dotenv import load_dotenv

from database import check_database
from auth import auth_bp
from complaints import complaints_bp
from ai_monitoring import ai_bp
from notifications import notifications_bp
from visitors import visitors_bp
from announcements import announcements_bp
from dues import dues_bp
from animal_detection import animal_bp


# Load environment variables from backend/.env
load_dotenv()

# Create the Flask application ONCE
app = Flask(__name__)

# Application configuration
app.config["SECRET_KEY"] = os.getenv(
    "SECRET_KEY",
    "dev-only-change-this-secret"
)

# Configure CORS for the Vite frontend
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "http://localhost:5173",
                "http://localhost:5174",
                "http://localhost:5175",
                "http://localhost:5176",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:5174",
                "http://127.0.0.1:5175",
                "http://127.0.0.1:5176",
            ]
        }
    },
    allow_headers=[
        "Content-Type",
        "Authorization"
    ],
    methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS"
    ],
    supports_credentials=False
)

# Register all application blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(complaints_bp)
app.register_blueprint(ai_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(visitors_bp)
app.register_blueprint(announcements_bp)
app.register_blueprint(dues_bp)
app.register_blueprint(animal_bp)


# Home route
@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "Intelligent Apartment Management System API",
        "status": "running"
    })


# Backend health check
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "success": True,
        "message": "Backend is running"
    })


# MongoDB health check
@app.route("/api/health/database", methods=["GET"])
def database_health():
    try:
        check_database()

        return jsonify({
            "success": True,
            "message": "MongoDB connection successful"
        })

    except Exception:
        app.logger.exception("Database connection failed")

        return jsonify({
            "success": False,
            "message": "Database connection failed"
        }), 503


# Start the Flask development server
if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
