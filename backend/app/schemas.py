from typing import List, Literal, Optional
from pydantic import BaseModel, Field

LevelType = Literal["Low", "Medium", "High", "Critical"]
SourceType = Literal["image", "video", "webcam"]
ModelNameType = Literal["Classical SVM", "MCNN", "CSRNet"]

class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    model: str
    mode: Literal["simulation", "real"]
    gpu: bool

class Point(BaseModel):
    x: float
    y: float

class PredictImageResponse(BaseModel):
    count: int
    level: LevelType
    density_map_url: str
    overlay_url: str
    zones: List[List[int]]
    processing_ms: int
    alert: bool = False

class VideoFrame(BaseModel):
    t: float
    count: int
    level: LevelType
    overlay_url: str

class PredictVideoResponse(BaseModel):
    frames: List[VideoFrame]
    peak: int
    avg: float

class LiveFrame(BaseModel):
    count: int
    level: LevelType
    zones: List[List[int]]
    timestamp: str
    points: Optional[List[Point]] = None

class HistoryItem(BaseModel):
    id: str
    source: SourceType
    filename: str
    count: int
    level: LevelType
    model: str
    created_at: str

    class Config:
        from_attributes = True

class NewHistoryItem(BaseModel):
    source: SourceType
    filename: str
    count: int
    level: LevelType
    model: str

class ModelMetric(BaseModel):
    name: ModelNameType
    mae: float
    rmse: float
    fps: float

class ScatterPoint(BaseModel):
    gt: int
    pred: int

class MetricsResponse(BaseModel):
    models: List[ModelMetric]
    scatter: List[ScatterPoint]

class Settings(BaseModel):
    low_max: int = 50
    medium_max: int = 150
    high_max: int = 300
    alarm_sound: bool = True
    email_alert: bool = False
    telegram_alert: bool = False
    model: ModelNameType = "CSRNet"
    zone_grid: int = 3
    source_url: str = ""
    email_to: Optional[str] = ""
    telegram_chat_id: Optional[str] = ""

class HistogramData(BaseModel):
    original: List[int]
    equalized: List[int]

class PreprocessResponse(BaseModel):
    original: str
    resized: str
    grayscale: str
    equalized: str
    histograms: HistogramData

class DetailError(BaseModel):
    detail: str
