import cv2
import time
import datetime
import threading
import numpy as np
from typing import Generator, Dict, Any, Tuple
from db.models import SettingsModel
from services.density_service import predict_crowd_simulation, generate_gaussian_density_map, compute_zones_from_points
from services.preprocess_service import get_latest_or_sample_image

class StreamManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(StreamManager, cls).__new__(cls)
                cls._instance.cap = None
                cls._instance.current_source = None
                cls._instance.synthetic_step = 0
                cls._instance.last_frame = None
                cls._instance.last_info = None
        return cls._instance

    def _get_cap(self, source_url: str):
        target = source_url.strip() if source_url else 0
        if self.cap is None or self.current_source != target:
            if self.cap is not None:
                try:
                    self.cap.release()
                except Exception:
                    pass
            try:
                self.cap = cv2.VideoCapture(target)
                self.current_source = target
            except Exception as e:
                print(f"[StreamManager] Could not open camera {target}: {e}")
                self.cap = None
        return self.cap

    def get_frame(self, settings: SettingsModel) -> Tuple[np.ndarray, bool]:
        """Returns (frame_bgr, is_real_camera). If camera fails, returns synthetic frame."""
        cap = self._get_cap(settings.source_url)
        if cap is not None and cap.isOpened():
            ret, frame = cap.read()
            if ret and frame is not None and frame.size > 0:
                return frame, True

        # Fallback to dynamic synthetic crowd scene
        self.synthetic_step += 1
        base = get_latest_or_sample_image().copy()
        h, w = base.shape[:2]

        # Add gentle motion to test the pipeline dynamically
        shift = int(5 * np.sin(self.synthetic_step * 0.2))
        M = np.float32([[1, 0, shift], [0, 1, 0]])
        frame = cv2.warpAffine(base, M, (w, h), borderMode=cv2.BORDER_REFLECT)
        return frame, False

    def get_live_data(self, settings: SettingsModel) -> Dict[str, Any]:
        frame, is_real = self.get_frame(settings)
        h, w = frame.shape[:2]
        sim = predict_crowd_simulation(frame, settings)

        iso_time = datetime.datetime.now(datetime.timezone.utc).isoformat()
        return {
            "count": int(sim["count"]),
            "level": sim["level"],
            "zones": sim["zones"],
            "timestamp": iso_time,
            "points": sim.get("points")
        }

    def mjpeg_generator(self, settings: SettingsModel) -> Generator[bytes, None, None]:
        """Yields multipart/x-mixed-replace MJPEG byte stream with heatmap overlay."""
        while True:
            try:
                frame, _ = self.get_frame(settings)
                h, w = frame.shape[:2]

                # Run simulation / prediction
                sim = predict_crowd_simulation(frame, settings)
                density = sim["density_map"]
                max_val = np.max(density)
                if max_val > 0:
                    norm = (density / max_val * 255.0).astype(np.uint8)
                    heatmap = cv2.applyColorMap(norm, cv2.COLORMAP_JET)
                    overlay = cv2.addWeighted(frame, 0.6, heatmap, 0.4, 0)
                else:
                    overlay = frame

                # Draw crowd count banner on top
                count_text = f"Crowd: {sim['count']} | {sim['level']}"
                cv2.putText(overlay, count_text, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 4)
                cv2.putText(overlay, count_text, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)

                ret, jpeg = cv2.imencode('.jpg', overlay, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if not ret:
                    continue

                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')

                time.sleep(0.1)  # ~10 FPS for stream bandwidth optimization
            except Exception as e:
                print(f"[StreamManager] MJPEG stream loop error: {e}")
                time.sleep(0.5)

stream_manager = StreamManager()
