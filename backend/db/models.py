import datetime
import uuid
from sqlalchemy import Column, String, Integer, Boolean, DateTime
from db.database import Base

def generate_history_id() -> str:
    # Generates a string id matching frontend conventions (e.g., h1719283748231)
    timestamp_ms = int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)
    return f"h{timestamp_ms}_{uuid.uuid4().hex[:6]}"

def current_iso_time() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

class HistoryModel(Base):
    __tablename__ = "history"

    id = Column(String, primary_key=True, default=generate_history_id)
    source = Column(String, nullable=False)      # "image" | "video" | "webcam"
    filename = Column(String, nullable=False)
    count = Column(Integer, nullable=False)
    level = Column(String, nullable=False)       # "Low" | "Medium" | "High" | "Critical"
    model = Column(String, nullable=False)
    created_at = Column(String, default=current_iso_time, nullable=False)

class AlertModel(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    count = Column(Integer, nullable=False)
    level = Column(String, nullable=False)
    source = Column(String, nullable=False)
    message = Column(String, nullable=False)
    created_at = Column(String, default=current_iso_time, nullable=False)

class SettingsModel(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, default=1)
    low_max = Column(Integer, default=50, nullable=False)
    medium_max = Column(Integer, default=150, nullable=False)
    high_max = Column(Integer, default=300, nullable=False)
    alarm_sound = Column(Boolean, default=True, nullable=False)
    email_alert = Column(Boolean, default=False, nullable=False)
    telegram_alert = Column(Boolean, default=False, nullable=False)
    model = Column(String, default="CSRNet", nullable=False)
    zone_grid = Column(Integer, default=3, nullable=False)
    source_url = Column(String, default="", nullable=False)
    email_to = Column(String, default="", nullable=True)
    telegram_chat_id = Column(String, default="", nullable=True)
