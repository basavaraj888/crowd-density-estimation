from fastapi import APIRouter, UploadFile, File, Query, Depends, HTTPException
from sqlalchemy.orm import Session
from pathlib import Path
import cv2
import numpy as np
import tempfile
import aiofiles
import os
import uuid

from app.config import (
    ALLOWED_IMAGE_EXTENSIONS,
    ALLOWED_VIDEO_EXTENSIONS,
    MAX_UPLOAD_SIZE,
    OUTPUTS_DIR
)
from app.schemas import PredictImageResponse, PredictVideoResponse
from db.database import get_db
from db.models import HistoryModel
from app.routes.settings import get_or_create_settings
from services.density_service import run_crowd_inference
from services.alert_service import check_and_trigger_alerts, determine_level
from services.video_service import process_video_async
from services.preprocess_service import set_latest_image_path

router = APIRouter(prefix="/predict", tags=["Prediction"])

@router.post("/image", response_model=PredictImageResponse)
async def predict_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Validate extension
    filename = file.filename or "uploaded_image.jpg"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image extension '{ext}'. Allowed: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}"
        )

    # Validate size & read content
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (exceeds 100MB limit).")

    # Decode image with OpenCV
    nparr = np.frombuffer(content, np.uint8)
    image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image_bgr is None:
        raise HTTPException(status_code=400, detail="Corrupted or invalid image file.")

    # Save to outputs so /preprocess can access it
    saved_input_path = OUTPUTS_DIR / f"latest_{uuid.uuid4().hex[:6]}_{filename}"
    cv2.imwrite(str(saved_input_path), image_bgr)
    set_latest_image_path(saved_input_path)

    settings = get_or_create_settings(db)

    # Run inference
    result = run_crowd_inference(image_bgr, settings)
    count = result["count"]
    level = result["level"]

    # Trigger alerts if threshold exceeded
    is_alert = check_and_trigger_alerts(
        count=count,
        level=level,
        source=f"Image ({filename})",
        settings=settings,
        db=db
    )

    # Save record to history
    history_record = HistoryModel(
        source="image",
        filename=filename,
        count=count,
        level=level,
        model=settings.model
    )
    db.add(history_record)
    db.commit()

    return PredictImageResponse(
        count=count,
        level=level,
        density_map_url=result["density_map_url"],
        overlay_url=result["overlay_url"],
        zones=result["zones"],
        processing_ms=result["processing_ms"],
        alert=is_alert
    )

@router.post("/video", response_model=PredictVideoResponse)
async def predict_video(
    file: UploadFile = File(...),
    frame_skip: int = Query(default=5, ge=1, le=60),
    db: Session = Depends(get_db)
):
    filename = file.filename or "uploaded_video.mp4"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video extension '{ext}'. Allowed: {', '.join(ALLOWED_VIDEO_EXTENSIONS)}"
        )

    # Write video to a temporary file
    temp_video_fd, temp_video_path = tempfile.mkstemp(suffix=ext)
    os.close(temp_video_fd)
    try:
        content = await file.read()
        if len(content) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="File too large (exceeds 100MB limit).")

        async with aiofiles.open(temp_video_path, "wb") as f:
            await f.write(content)

        settings = get_or_create_settings(db)

        # Process video asynchronously in threadpool
        video_result = await process_video_async(
            video_path=Path(temp_video_path),
            frame_skip=frame_skip,
            settings=settings
        )

        peak = video_result["peak"]
        peak_level = determine_level(peak, settings)

        # Trigger alerts if peak count exceeded
        check_and_trigger_alerts(
            count=peak,
            level=peak_level,
            source=f"Video ({filename})",
            settings=settings,
            db=db
        )

        # Save to history automatically
        history_record = HistoryModel(
            source="video",
            filename=filename,
            count=peak,
            level=peak_level,
            model=settings.model
        )
        db.add(history_record)
        db.commit()

        return PredictVideoResponse(
            frames=video_result["frames"],
            peak=peak,
            avg=video_result["avg"]
        )
    finally:
        if os.path.exists(temp_video_path):
            try:
                os.remove(temp_video_path)
            except Exception:
                pass
