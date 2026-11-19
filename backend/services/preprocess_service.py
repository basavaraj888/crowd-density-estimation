import cv2
import numpy as np
import uuid
from pathlib import Path
from typing import Tuple, Dict, Any
from app.config import OUTPUTS_DIR, SAMPLES_DIR

# Stores the path to the most recently uploaded image for GET /preprocess
LATEST_IMAGE_PATH: Path | None = None

def get_latest_or_sample_image() -> np.ndarray:
    global LATEST_IMAGE_PATH
    if LATEST_IMAGE_PATH and LATEST_IMAGE_PATH.exists():
        img = cv2.imread(str(LATEST_IMAGE_PATH))
        if img is not None:
            return img

    sample_path = SAMPLES_DIR / "sample.jpg"
    if sample_path.exists():
        img = cv2.imread(str(sample_path))
        if img is not None:
            return img

    # Synthesize fallback crowd image if neither exists
    synthetic = np.full((400, 600, 3), 235, dtype=np.uint8)
    # Draw simple background and some person-like figures
    cv2.rectangle(synthetic, (0, 0), (600, 200), (200, 220, 240), -1)
    cv2.rectangle(synthetic, (0, 200), (600, 400), (180, 180, 180), -1)
    np.random.seed(42)
    for _ in range(50):
        x = np.random.randint(50, 550)
        y = np.random.randint(180, 380)
        cv2.circle(synthetic, (x, y - 20), 8, (50, 60, 80), -1) # Head
        cv2.ellipse(synthetic, (x, y), (12, 20), 0, 0, 360, (70, 90, 120), -1) # Body
    cv2.imwrite(str(sample_path), synthetic)
    return synthetic

def set_latest_image_path(path: Path):
    global LATEST_IMAGE_PATH
    LATEST_IMAGE_PATH = path

def run_preprocess_pipeline(image_bgr: np.ndarray) -> Dict[str, Any]:
    uid = uuid.uuid4().hex[:8]

    # 1. Original (scale if too large to max 1200 dimension)
    h, w = image_bgr.shape[:2]
    scale = min(1.0, 1200.0 / max(w, h))
    if scale < 1.0:
        orig = cv2.resize(image_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    else:
        orig = image_bgr.copy()
    orig_path = OUTPUTS_DIR / f"prep_{uid}_orig.jpg"
    cv2.imwrite(str(orig_path), orig, [cv2.IMWRITE_JPEG_QUALITY, 90])

    # 2. Resized to 224x224
    resized = cv2.resize(image_bgr, (224, 224), interpolation=cv2.INTER_LINEAR)
    resized_path = OUTPUTS_DIR / f"prep_{uid}_resized.png"
    cv2.imwrite(str(resized_path), resized)

    # 3. Grayscale (224x224)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    gray_path = OUTPUTS_DIR / f"prep_{uid}_gray.png"
    cv2.imwrite(str(gray_path), gray)

    # 4. Equalized (224x224)
    equalized = cv2.equalizeHist(gray)
    equalized_path = OUTPUTS_DIR / f"prep_{uid}_eq.png"
    cv2.imwrite(str(equalized_path), equalized)

    # 5. Compute 256-bin histograms
    hist_orig = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten().astype(int).tolist()
    hist_eq = cv2.calcHist([equalized], [0], None, [256], [0, 256]).flatten().astype(int).tolist()

    return {
        "original": f"/outputs/{orig_path.name}",
        "resized": f"/outputs/{resized_path.name}",
        "grayscale": f"/outputs/{gray_path.name}",
        "equalized": f"/outputs/{equalized_path.name}",
        "histograms": {
            "original": hist_orig,
            "equalized": hist_eq
        }
    }
