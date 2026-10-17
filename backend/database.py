
import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

mongo_uri = os.getenv("MONGO_URI")
database_name = os.getenv(
    "MONGO_DB_NAME",
    "intelligent_apartment"
)

if not mongo_uri:
    raise RuntimeError(
        "MONGO_URI is missing from backend/.env"
    )

client = MongoClient(
    mongo_uri,
    serverSelectionTimeoutMS=5000
)

db = client[database_name]


def check_database():
    client.admin.command("ping")
    return True
