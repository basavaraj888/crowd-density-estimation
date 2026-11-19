import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import threading
import requests
from sqlalchemy.orm import Session
from app.config import (
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, ALERT_EMAIL_FROM,
    TELEGRAM_BOT_TOKEN, TELEGRAM_DEFAULT_CHAT_ID
)
from app.schemas import LevelType
from db.models import AlertModel, SettingsModel

def determine_level(count: int, settings: SettingsModel) -> LevelType:
    if count <= settings.low_max:
        return "Low"
    elif count <= settings.medium_max:
        return "Medium"
    elif count <= settings.high_max:
        return "High"
    return "Critical"

def send_email_async(to_email: str, subject: str, message_body: str):
    if not (SMTP_HOST and SMTP_USER and SMTP_PASSWORD and to_email):
        return

    def _send():
        try:
            msg = MIMEMultipart()
            msg["From"] = ALERT_EMAIL_FROM
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(message_body, "plain"))

            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)
        except Exception as e:
            print(f"[AlertService] Email alert failed: {e}")

    threading.Thread(target=_send, daemon=True).start()

def send_telegram_async(chat_id: str, message: str):
    token = TELEGRAM_BOT_TOKEN
    target = chat_id or TELEGRAM_DEFAULT_CHAT_ID
    if not (token and target):
        return

    def _send():
        try:
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            payload = {"chat_id": target, "text": message, "parse_mode": "Markdown"}
            requests.post(url, json=payload, timeout=8)
        except Exception as e:
            print(f"[AlertService] Telegram alert failed: {e}")

    threading.Thread(target=_send, daemon=True).start()

def check_and_trigger_alerts(count: int, level: LevelType, source: str, settings: SettingsModel, db: Session) -> bool:
    is_alert = (level == "Critical") or (count > settings.high_max)
    if is_alert:
        # 1. Log alert into database
        alert_msg = f"Critical crowd threshold exceeded: {count} people detected (Threshold: {settings.high_max}) from {source}."
        alert_record = AlertModel(
            count=count,
            level=level,
            source=source,
            message=alert_msg
        )
        db.add(alert_record)
        db.commit()

        # 2. Optional Email alert
        if settings.email_alert and settings.email_to:
            send_email_async(
                to_email=settings.email_to,
                subject=f"[CrowdSense Alert] Critical Crowd Level: {count} People",
                message_body=alert_msg
            )

        # 3. Optional Telegram alert
        if settings.telegram_alert and (settings.telegram_chat_id or TELEGRAM_DEFAULT_CHAT_ID):
            send_telegram_async(
                chat_id=settings.telegram_chat_id or TELEGRAM_DEFAULT_CHAT_ID,
                message=f"⚠️ *CROWDSENSE CRITICAL ALERT*\n\n{alert_msg}"
            )

    return is_alert
