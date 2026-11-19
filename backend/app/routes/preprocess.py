from fastapi import APIRouter, UploadFile, File, HTTPException
import cv2
import numpy as np
from pathlib import Path
from app.schemas import PreprocessResponse
from services.preprocess_service import (
    get_latest_or_sample_image,
    run_preprocess_pipeline,
    set_latest_image_path
)
from app.config import OUTPUTS_DIR, ALLOWED_IMAGE_EXTENSIONS, MAX_UPLOAD_SIZE

router = APIRouter(prefix="/preprocess", tags=["Preprocess"])

@router.get("", response_model=PreprocessResponse)
def get_preprocess():
    img = get_latest_or_sample_image()
    result = run_preprocess_pipeline(img)
    return PreprocessResponse(**result)

@router.post("", response_model=PreprocessResponse)
async def post_preprocess(file: UploadFile = File(...)):
    # Validate extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image format '{ext}'. Allowed: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}"
        )

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (exceeds 100MB limit).")

    nparr = np.frombuffer(content, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Could not decode image.")

    # Save to temp outputs
    temp_path = OUTPUTS_DIR / f"upload_{file.filename}"
    cv2.imwrite(str(temp_path), img)
    set_latest_image_path(temp_path)

    result = run_preprocess_pipeline(img)
    return PreprocessResponse(**result)
