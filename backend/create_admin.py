
import os
import getpass
from datetime import datetime, timezone

from dotenv import load_dotenv
from werkzeug.security import generate_password_hash
from pymongo.errors import DuplicateKeyError

from database import db

load_dotenv()

users = db["users"]


def main():
    print("=== Create Administrator Account ===")

    name = input("Admin name: ").strip()
    email = input("Admin email: ").strip().lower()
    setup_key = input("Admin setup key: ").strip()
    expected_key = os.getenv("ADMIN_SETUP_KEY", "")

    if not expected_key or setup_key != expected_key:
        print("ERROR: Admin setup key is incorrect.")
        return

    if not name or not email or "@" not in email:
        print("ERROR: Enter a valid name and email.")
        return

    password = getpass.getpass("Admin password: ")
    confirm = getpass.getpass("Confirm admin password: ")

    if len(password) < 8:
        print("ERROR: Password must contain at least 8 characters.")
        return

    if password != confirm:
        print("ERROR: Passwords do not match.")
        return

    if users.find_one({"email": email}):
        print(
            "ERROR: This email already exists. "
            "No existing account was changed."
        )
        return

    admin = {
        "name": name,
        "email": email,
        "password": generate_password_hash(password),
        "role": "ADMIN",
        "created_at": datetime.now(timezone.utc),
    }

    try:
        users.insert_one(admin)
        print("SUCCESS: Admin account created.")
        print("You can now log in using this email and password.")
    except DuplicateKeyError:
        print(
            "ERROR: This email already exists. "
            "No existing account was changed."
        )


if __name__ == "__main__":
    main()