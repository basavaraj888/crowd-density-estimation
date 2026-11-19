import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from backend root
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

# Base paths
BASE_DIR = BACKEND_DIR
OUTPUTS_DIR = BASE_DIR / "outputs"
WEIGHTS_DIR = BASE_DIR / "weights"
SAMPLES_DIR = BASE_DIR / "samples"
RESULTS_FILE = BASE_DIR / "results" / "results.json"
DB_PATH = BASE_DIR / "crowd.db"
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

# Ensure required directories exist
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
(BASE_DIR / "results").mkdir(parents=True, exist_ok=True)

# Server config
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
DEBUG = os.getenv("DEBUG", "True").lower() in ("true", "1", "t")

# CORS Origins
cors_raw = os.getenv("CORS_ORIGINS", "*")
if cors_raw.strip() == "*":
    CORS_ORIGINS = ["*"]
else:
    CORS_ORIGINS = [origin.strip() for origin in cors_raw.split(",") if origin.strip()]

# Hardware device
DEVICE_SETTING = os.getenv("DEVICE", "cpu").lower()

# Alert Settings (Optional SMTP & Telegram)
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
ALERT_EMAIL_FROM = os.getenv("ALERT_EMAIL_FROM", "alerts@crowdsense.local")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_DEFAULT_CHAT_ID = os.getenv("TELEGRAM_DEFAULT_CHAT_ID", "")

# Limits and constants
MAX_UPLOAD_SIZE = 100 * 1024 * 1024  # 100 MB
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".webm"}
