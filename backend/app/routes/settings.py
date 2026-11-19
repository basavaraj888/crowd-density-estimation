from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import SettingsModel
from app.schemas import Settings

router = APIRouter(tags=["Settings"])

def get_or_create_settings(db: Session) -> SettingsModel:
    settings_record = db.query(SettingsModel).filter(SettingsModel.id == 1).first()
    if not settings_record:
        settings_record = SettingsModel(
            id=1,
            low_max=50,
            medium_max=150,
            high_max=300,
            alarm_sound=True,
            email_alert=False,
            telegram_alert=False,
            model="CSRNet",
            zone_grid=3,
            source_url="",
            email_to="",
            telegram_chat_id=""
        )
        db.add(settings_record)
        db.commit()
        db.refresh(settings_record)
    return settings_record

@router.get("/settings", response_model=Settings)
def get_settings(db: Session = Depends(get_db)):
    record = get_or_create_settings(db)
    return Settings(
        low_max=record.low_max,
        medium_max=record.medium_max,
        high_max=record.high_max,
        alarm_sound=record.alarm_sound,
        email_alert=record.email_alert,
        telegram_alert=record.telegram_alert,
        model=record.model,
        zone_grid=record.zone_grid,
        source_url=record.source_url,
        email_to=record.email_to or "",
        telegram_chat_id=record.telegram_chat_id or ""
    )

@router.put("/settings", response_model=Settings)
def update_settings(payload: Settings, db: Session = Depends(get_db)):
    record = get_or_create_settings(db)
    record.low_max = payload.low_max
    record.medium_max = payload.medium_max
    record.high_max = payload.high_max
    record.alarm_sound = payload.alarm_sound
    record.email_alert = payload.email_alert
    record.telegram_alert = payload.telegram_alert
    record.model = payload.model
    record.zone_grid = payload.zone_grid
    record.source_url = payload.source_url
    record.email_to = payload.email_to or ""
    record.telegram_chat_id = payload.telegram_chat_id or ""

    db.commit()
    db.refresh(record)

    return Settings(
        low_max=record.low_max,
        medium_max=record.medium_max,
        high_max=record.high_max,
        alarm_sound=record.alarm_sound,
        email_alert=record.email_alert,
        telegram_alert=record.telegram_alert,
        model=record.model,
        zone_grid=record.zone_grid,
        source_url=record.source_url,
        email_to=record.email_to or "",
        telegram_chat_id=record.telegram_chat_id or ""
    )
