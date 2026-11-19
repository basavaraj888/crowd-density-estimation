from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import torch
from db.database import get_db
from app.schemas import HealthResponse
from app.routes.settings import get_or_create_settings
from services.density_service import get_current_mode

router = APIRouter(tags=["Health"])

@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    settings = get_or_create_settings(db)
    mode = get_current_mode(settings.model)
    has_gpu = bool(torch.cuda.is_available())

    return HealthResponse(
        status="ok",
        model=settings.model,
        mode=mode, # "simulation" | "real"
        gpu=has_gpu
    )
