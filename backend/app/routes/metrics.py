import json
from fastapi import APIRouter, HTTPException
from app.config import RESULTS_FILE
from app.schemas import MetricsResponse, ModelMetric, ScatterPoint

router = APIRouter(tags=["Metrics"])

DEFAULT_METRICS = {
    "models": [
        {"name": "Classical SVM", "mae": 110.0, "rmse": 160.0, "fps": 25.0},
        {"name": "MCNN", "mae": 110.0, "rmse": 173.0, "fps": 14.0},
        {"name": "CSRNet", "mae": 68.0, "rmse": 115.0, "fps": 9.0}
    ],
    "scatter": [
        {"gt": 45, "pred": 42},
        {"gt": 112, "pred": 120},
        {"gt": 230, "pred": 242},
        {"gt": 380, "pred": 372},
        {"gt": 560, "pred": 574},
        {"gt": 745, "pred": 738},
        {"gt": 930, "pred": 948},
        {"gt": 1145, "pred": 1162}
    ]
}

@router.get("/metrics", response_model=MetricsResponse)
def get_metrics():
    if RESULTS_FILE.exists():
        try:
            with open(RESULTS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return MetricsResponse(**data)
        except Exception as e:
            print(f"[MetricsRoute] Error reading results.json: {e}")

    return MetricsResponse(**DEFAULT_METRICS)
