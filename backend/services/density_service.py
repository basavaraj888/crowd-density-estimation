import time
import uuid
from pathlib import Path
from typing import Tuple, List, Dict, Any, Optional
import cv2
import numpy as np
import torch
from app.config import OUTPUTS_DIR, WEIGHTS_DIR, DEVICE_SETTING
from app.schemas import LevelType, Point
from db.models import SettingsModel
from services.alert_service import determine_level

# Lazy global model holder
YOLO_MODEL = None

def get_yolo_model():
    global YOLO_MODEL
    if YOLO_MODEL is None:
        try:
            from ultralytics import YOLO
            # ultralytics automatically downloads yolov8n.pt if not locally cached
            YOLO_MODEL = YOLO("yolov8n.pt")
        except Exception as e:
            print(f"[DensityService] Warning: Failed to load YOLOv8: {e}")
            YOLO_MODEL = None
    return YOLO_MODEL

def is_model_weights_available(model_name: str) -> bool:
    if model_name == "CSRNet":
        return (WEIGHTS_DIR / "csrnet.pth").exists()
    elif model_name == "MCNN":
        return (WEIGHTS_DIR / "mcnn.pth").exists()
    elif model_name == "Classical SVM":
        return (WEIGHTS_DIR / "svm.pkl").exists()
    return False

def get_current_mode(model_name: str) -> str:
    return "real" if is_model_weights_available(model_name) else "simulation"

def compute_zones_from_points(points: List[Dict[str, float]], n: int) -> List[List[int]]:
    """Compute NxN zone grid from normalized points (0..1)."""
    zones = [[0 for _ in range(n)] for _ in range(n)]
    for p in points:
        r = min(n - 1, max(0, int(p["y"] * n)))
        c = min(n - 1, max(0, int(p["x"] * n)))
        zones[r][c] += 1
    return zones

def generate_gaussian_density_map(
    points: List[Dict[str, float]],
    width: int,
    height: int,
    sigma: Optional[float] = None
) -> np.ndarray:
    """Generate 2D continuous Gaussian density map."""
    density = np.zeros((height, width), dtype=np.float32)
    if not points:
        return density

    if sigma is None:
        sigma = max(8.0, min(width, height) * 0.025)

    radius = int(np.ceil(sigma * 3))
    s2 = 2.0 * sigma * sigma

    for p in points:
        cx = p["x"] * width
        cy = p["y"] * height

        x0 = max(0, int(np.floor(cx - radius)))
        x1 = min(width - 1, int(np.ceil(cx + radius)))
        y0 = max(0, int(np.floor(cy - radius)))
        y1 = min(height - 1, int(np.ceil(cy + radius)))

        if x0 > x1 or y0 > y1:
            continue

        y_indices, x_indices = np.ogrid[y0:y1 + 1, x0:x1 + 1]
        dist_sq = (x_indices - cx) ** 2 + (y_indices - cy) ** 2
        kernel = np.exp(-dist_sq / s2)
        density[y0:y1 + 1, x0:x1 + 1] += kernel

    return density

def create_visualizations(
    image_bgr: np.ndarray,
    density_map: np.ndarray,
    uid: str
) -> Tuple[str, str]:
    """Generate and save Jet density map and overlay image with relative URLs."""
    h, w = image_bgr.shape[:2]

    # Normalize density map for visualization
    max_val = np.max(density_map)
    if max_val > 0:
        norm_density = (density_map / max_val * 255.0).astype(np.uint8)
    else:
        norm_density = np.zeros((h, w), dtype=np.uint8)

    # Colorize with JET colormap
    color_map = cv2.applyColorMap(norm_density, cv2.COLORMAP_JET)

    # 1. Standalone Jet density map with transparent / dark background
    density_filename = f"dens_{uid}.png"
    density_path = OUTPUTS_DIR / density_filename
    cv2.imwrite(str(density_path), color_map)

    # 2. Overlay onto original image (blend with 0.55 opacity)
    overlay = cv2.addWeighted(image_bgr, 0.55, color_map, 0.45, 0)
    overlay_filename = f"over_{uid}.jpg"
    overlay_path = OUTPUTS_DIR / overlay_filename
    cv2.imwrite(str(overlay_path), overlay, [cv2.IMWRITE_JPEG_QUALITY, 90])

    return f"/outputs/{density_filename}", f"/outputs/{overlay_filename}"

def predict_crowd_simulation(
    image_bgr: np.ndarray,
    settings: SettingsModel
) -> Dict[str, Any]:
    """Simulation mode using YOLOv8 detection and Gaussian density estimation."""
    h, w = image_bgr.shape[:2]
    yolo = get_yolo_model()
    points: List[Dict[str, float]] = []

    if yolo is not None:
        try:
            results = yolo(image_bgr, verbose=False)
            if results and len(results) > 0:
                boxes = results[0].boxes
                for box in boxes:
                    # Class 0 in COCO is person
                    if int(box.cls[0].item()) == 0:
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        cx = ((x1 + x2) / 2.0) / w
                        cy = ((y1 + y2) / 2.0) / h
                        points.append({"x": max(0.0, min(1.0, cx)), "y": max(0.0, min(1.0, cy))})
        except Exception as e:
            print(f"[DensityService] YOLO prediction error: {e}")

    # Fallback to feature / corner crowd simulation if 0 detected (e.g. dense blurry crowd or test texture)
    if len(points) == 0:
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        corners = cv2.goodFeaturesToTrack(gray, maxCorners=120, qualityLevel=0.03, minDistance=10)
        if corners is not None and len(corners) > 0:
            for pt in corners:
                x, y = pt[0]
                points.append({"x": float(x / w), "y": float(y / h)})
        else:
            # Baseline sparse sample
            np.random.seed(int(time.time() * 1000) % 10000)
            count_sim = np.random.randint(15, 60)
            for _ in range(count_sim):
                points.append({"x": float(np.random.uniform(0.1, 0.9)), "y": float(np.random.uniform(0.2, 0.9))})

    count = len(points)
    density_map = generate_gaussian_density_map(points, w, h)
    zones = compute_zones_from_points(points, settings.zone_grid)
    level = determine_level(count, settings)

    return {
        "count": count,
        "level": level,
        "density_map": density_map,
        "zones": zones,
        "points": points
    }

def run_crowd_inference(
    image_bgr: np.ndarray,
    settings: SettingsModel
) -> Dict[str, Any]:
    """Runs chosen model or falls back to simulation mode seamlessly."""
    start_time = time.perf_counter()
    uid = uuid.uuid4().hex[:8]

    # For Stage 1: Since weights are not loaded yet, simulation mode runs.
    # When Stage 2 is built, Real CSRNet/MCNN/SVM will execute when weights exist.
    sim_result = predict_crowd_simulation(image_bgr, settings)

    count = int(sim_result["count"])
    level = sim_result["level"]
    density_map = sim_result["density_map"]
    zones = sim_result["zones"]

    dens_url, over_url = create_visualizations(image_bgr, density_map, uid)
    processing_ms = int(round((time.perf_counter() - start_time) * 1000))

    return {
        "count": count,
        "level": level,
        "density_map_url": dens_url,
        "overlay_url": over_url,
        "zones": zones,
        "processing_ms": max(1, processing_ms),
        "points": sim_result.get("points", [])
    }
