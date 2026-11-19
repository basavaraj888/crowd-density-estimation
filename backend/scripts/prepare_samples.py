import os
import shutil
from pathlib import Path
import cv2
import numpy as np

BRAIN_DIR = Path(r"C:\Users\Basavaraj\.gemini\antigravity-ide\brain\a044abe2-0960-499b-99e0-f1b1dc484d84")
BACKEND_DIR = Path(__file__).resolve().parent.parent
SAMPLES_DIR = BACKEND_DIR / "samples"
PUBLIC_DIR = BACKEND_DIR.parent / "public" / "samples"

SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

img_plaza = BRAIN_DIR / "crowd_sample_surveillance_1793093370362.jpg"
img_metro = BRAIN_DIR / "metro_crowd_surveillance_1793093424474.jpg"

if img_plaza.exists():
    shutil.copy(img_plaza, SAMPLES_DIR / "sample.jpg")
    shutil.copy(img_plaza, SAMPLES_DIR / "sample_plaza.jpg")
    shutil.copy(img_plaza, PUBLIC_DIR / "sample_plaza.jpg")

if img_metro.exists():
    shutil.copy(img_metro, SAMPLES_DIR / "sample_metro.jpg")
    shutil.copy(img_metro, PUBLIC_DIR / "sample_metro.jpg")

def create_smooth_video(source_img_path: Path, output_video_path: Path, frames: int = 120, fps: int = 15):
    img = cv2.imread(str(source_img_path))
    if img is None:
        print(f"Cannot read {source_img_path}")
        return
    h, w = img.shape[:2]
    out_w, out_h = 1280, 720
    
    # Try mp4v or avc1
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(str(output_video_path), fourcc, float(fps), (out_w, out_h))
    
    for i in range(frames):
        phase = (i / float(frames)) * 2 * np.pi
        scale = 1.0 + 0.04 * np.sin(phase)
        dx = int(35 * np.sin(phase))
        dy = int(12 * np.cos(phase))
        
        M = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), 0, scale)
        M[0, 2] += dx
        M[1, 2] += dy
        
        warped = cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_REFLECT)
        resized = cv2.resize(warped, (out_w, out_h), interpolation=cv2.INTER_LINEAR)
        writer.write(resized)
    writer.release()
    print(f"Saved video to {output_video_path}")

if img_plaza.exists():
    create_smooth_video(img_plaza, SAMPLES_DIR / "crowd_plaza.mp4")
    create_smooth_video(img_plaza, PUBLIC_DIR / "crowd_plaza.mp4")

if img_metro.exists():
    create_smooth_video(img_metro, SAMPLES_DIR / "crowd_metro.mp4")
    create_smooth_video(img_metro, PUBLIC_DIR / "crowd_metro.mp4")

print("Samples prepared successfully.")
