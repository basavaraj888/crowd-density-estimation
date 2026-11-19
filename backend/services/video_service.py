import cv2
import uuid
import numpy as np
import concurrent.futures
from pathlib import Path
from typing import Dict, Any, List
from app.config import OUTPUTS_DIR
from db.models import SettingsModel
from services.density_service import predict_crowd_simulation, create_visualizations

executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)

def process_video_file(
    video_path: Path,
    frame_skip: int,
    settings: SettingsModel
) -> Dict[str, Any]:
    """Processes video frames, sampling evenly and capping at 60 frames."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError("Failed to open or decode video file.")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or np.isnan(fps):
        fps = 25.0

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if total_frames > 0 else 10.0

    # Ensure frame_skip is at least 1
    frame_skip = max(1, frame_skip)

    # Determine frames to process
    # If total_frames > 0, pick candidate frames with step frame_skip
    if total_frames > 0:
        candidate_indices = list(range(0, total_frames, frame_skip))
    else:
        candidate_indices = []

    # Cap to max 60 evenly sampled frames
    if len(candidate_indices) > 60:
        step = len(candidate_indices) / 60.0
        selected_indices = [candidate_indices[int(i * step)] for i in range(60)]
    else:
        selected_indices = candidate_indices

    selected_set = set(selected_indices) if selected_indices else None

    frames_result: List[Dict[str, Any]] = []
    current_frame_idx = 0
    read_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if selected_set is None:
            # If total_frames was unknown
            if current_frame_idx % frame_skip == 0:
                should_process = True
            else:
                should_process = False
        else:
            should_process = (current_frame_idx in selected_set)

        if should_process:
            t = round(current_frame_idx / fps, 2)
            uid = uuid.uuid4().hex[:8]
            sim = predict_crowd_simulation(frame, settings)
            c = int(sim["count"])
            lvl = sim["level"]

            _, overlay_url = create_visualizations(frame, sim["density_map"], uid)

            frames_result.append({
                "t": t,
                "count": c,
                "level": lvl,
                "overlay_url": overlay_url
            })
            read_count += 1
            if read_count >= 60:
                break

        current_frame_idx += 1

    cap.release()

    if not frames_result:
        # Fallback if no frames were read
        frames_result.append({
            "t": 0.0,
            "count": 0,
            "level": "Low",
            "overlay_url": ""
        })

    counts = [f["count"] for f in frames_result]
    peak = int(max(counts))
    avg = round(float(sum(counts)) / max(1, len(counts)), 1)

    return {
        "frames": frames_result,
        "peak": peak,
        "avg": avg
    }

async def process_video_async(
    video_path: Path,
    frame_skip: int,
    settings: SettingsModel
) -> Dict[str, Any]:
    """Runs video processing in background threadpool."""
    loop = concurrent.futures.get_event_loop() if hasattr(concurrent.futures, "get_event_loop") else None
    import asyncio
    return await asyncio.get_running_loop().run_in_executor(
        executor, process_video_file, video_path, frame_skip, settings
    )
