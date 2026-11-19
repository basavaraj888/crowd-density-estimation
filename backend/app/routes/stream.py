import asyncio
import json
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from db.database import get_db, SessionLocal
from app.schemas import LiveFrame
from app.routes.settings import get_or_create_settings
from services.stream_service import stream_manager

router = APIRouter(prefix="/stream", tags=["Streaming"])

@router.get("/live", response_model=LiveFrame)
def get_live_frame(db: Session = Depends(get_db)):
    settings = get_or_create_settings(db)
    data = stream_manager.get_live_data(settings)
    return LiveFrame(**data)

@router.get("/mjpeg")
def get_mjpeg_stream(db: Session = Depends(get_db)):
    settings = get_or_create_settings(db)
    return StreamingResponse(
        stream_manager.mjpeg_generator(settings),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@router.websocket("/ws")
async def websocket_stream_alias(websocket: WebSocket):
    await websocket.accept()
    db = SessionLocal()
    try:
        while True:
            settings = get_or_create_settings(db)
            data = stream_manager.get_live_data(settings)
            await websocket.send_text(json.dumps(data))
            await asyncio.sleep(1.0)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        db.close()
