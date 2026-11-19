import sys
import os
import json
import time
import tempfile
import cv2
import numpy as np
import httpx
import websockets
import asyncio

BASE_URL = os.getenv("TEST_BASE_URL", "http://127.0.0.1:8000")
WS_URL = BASE_URL.replace("http://", "ws://").replace("https://", "wss://") + "/ws/stream"

test_results = []

def record(name: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    test_results.append((name, passed, detail))
    print(f"[{status}] {name}" + (f" -> {detail}" if detail else ""))

def create_dummy_image() -> bytes:
    img = np.zeros((300, 400, 3), dtype=np.uint8)
    img[:] = (220, 220, 220)
    # Draw crowd heads
    for i in range(15):
        x = int(30 + i * 22)
        y = int(120 + 30 * np.sin(i))
        cv2.circle(img, (x, y), 10, (40, 50, 70), -1)
    ret, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()

def create_dummy_video() -> str:
    fd, path = tempfile.mkstemp(suffix=".mp4")
    os.close(fd)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(path, fourcc, 10.0, (200, 150))
    for frame_idx in range(15):
        frame = np.full((150, 200, 3), 180 + frame_idx * 4, dtype=np.uint8)
        cv2.circle(frame, (30 + frame_idx * 8, 75), 12, (20, 30, 50), -1)
        out.write(frame)
    out.release()
    return path

async def run_tests():
    print(f"\n==========================================")
    print(f"  RUNNING CROWD SENSE CONTRACT TESTS")
    print(f"  Target: {BASE_URL}")
    print(f"==========================================\n")

    client = httpx.AsyncClient(base_url=BASE_URL, timeout=30.0)

    # 1. GET /health
    try:
        r = await client.get("/health")
        assert r.status_code == 200, f"Status {r.status_code}"
        j = r.json()
        assert j["status"] == "ok"
        assert "model" in j
        assert j["mode"] in ["simulation", "real"]
        assert isinstance(j["gpu"], bool)
        record("GET /health", True, f"mode={j['mode']}, model={j['model']}, gpu={j['gpu']}")
    except Exception as e:
        record("GET /health", False, str(e))

    # 2. GET /settings
    try:
        r = await client.get("/settings")
        assert r.status_code == 200, f"Status {r.status_code}"
        j = r.json()
        for k in ["low_max", "medium_max", "high_max", "model", "zone_grid"]:
            assert k in j, f"Missing key {k}"
        record("GET /settings", True, f"model={j['model']}, zone_grid={j['zone_grid']}")
    except Exception as e:
        record("GET /settings", False, str(e))

    # 3. PUT /settings
    try:
        update_payload = {
            "low_max": 45,
            "medium_max": 140,
            "high_max": 280,
            "alarm_sound": True,
            "email_alert": False,
            "telegram_alert": False,
            "model": "CSRNet",
            "zone_grid": 3,
            "source_url": "",
            "email_to": "admin@example.com",
            "telegram_chat_id": ""
        }
        r = await client.put("/settings", json=update_payload)
        assert r.status_code == 200, f"Status {r.status_code}"
        j = r.json()
        assert j["low_max"] == 45
        assert j["high_max"] == 280
        record("PUT /settings", True, "Successfully updated and persisted settings")
    except Exception as e:
        record("PUT /settings", False, str(e))

    # 4. GET /metrics
    try:
        r = await client.get("/metrics")
        assert r.status_code == 200, f"Status {r.status_code}"
        j = r.json()
        assert "models" in j and isinstance(j["models"], list)
        assert len(j["models"]) >= 3
        assert "scatter" in j and isinstance(j["scatter"], list)
        assert len(j["scatter"]) > 0
        record("GET /metrics", True, f"{len(j['models'])} models, {len(j['scatter'])} scatter points")
    except Exception as e:
        record("GET /metrics", False, str(e))

    # 5. POST /predict/image
    try:
        img_bytes = create_dummy_image()
        files = {"file": ("test_crowd.jpg", img_bytes, "image/jpeg")}
        r = await client.post("/predict/image", files=files)
        assert r.status_code == 200, f"Status {r.status_code}: {r.text}"
        j = r.json()
        assert isinstance(j["count"], int)
        assert j["level"] in ["Low", "Medium", "High", "Critical"]
        assert j["density_map_url"].startswith("/outputs/")
        assert j["overlay_url"].startswith("/outputs/")
        assert isinstance(j["zones"], list)
        assert isinstance(j["processing_ms"], int)
        assert isinstance(j["alert"], bool)
        record("POST /predict/image", True, f"count={j['count']}, level={j['level']}, ms={j['processing_ms']}")
    except Exception as e:
        record("POST /predict/image", False, str(e))

    # 6. GET /preprocess
    try:
        r = await client.get("/preprocess")
        assert r.status_code == 200, f"Status {r.status_code}"
        j = r.json()
        for k in ["original", "resized", "grayscale", "equalized"]:
            assert j[k].startswith("/outputs/"), f"{k} URL invalid: {j[k]}"
        assert "histograms" in j
        assert len(j["histograms"]["original"]) == 256
        assert len(j["histograms"]["equalized"]) == 256
        record("GET /preprocess", True, "All 4 stages and 256-bin histograms verified")
    except Exception as e:
        record("GET /preprocess", False, str(e))

    # 7. POST /predict/video
    video_path = create_dummy_video()
    try:
        with open(video_path, "rb") as vf:
            files = {"file": ("sample_test.mp4", vf, "video/mp4")}
            r = await client.post("/predict/video?frame_skip=3", files=files)
            assert r.status_code == 200, f"Status {r.status_code}: {r.text}"
            j = r.json()
            assert "frames" in j and isinstance(j["frames"], list)
            assert len(j["frames"]) <= 60
            assert "peak" in j and isinstance(j["peak"], int)
            assert "avg" in j
            first_frame = j["frames"][0]
            assert "t" in first_frame and "count" in first_frame and "overlay_url" in first_frame
            record("POST /predict/video", True, f"frames={len(j['frames'])}, peak={j['peak']}, avg={j['avg']}")
    except Exception as e:
        record("POST /predict/video", False, str(e))
    finally:
        if os.path.exists(video_path):
            os.remove(video_path)

    # 8. GET /history
    created_id = None
    try:
        r = await client.get("/history")
        assert r.status_code == 200, f"Status {r.status_code}"
        items = r.json()
        assert isinstance(items, list)
        if len(items) > 0:
            item = items[0]
            assert "id" in item
            assert item["source"] in ["image", "video", "webcam"]
            assert "count" in item
            assert item["level"] in ["Low", "Medium", "High", "Critical"]
            assert "created_at" in item
        record("GET /history", True, f"{len(items)} history entries found")
    except Exception as e:
        record("GET /history", False, str(e))

    # 9. POST /history
    try:
        post_payload = {
            "source": "image",
            "filename": "manual_audit.jpg",
            "count": 78,
            "level": "Medium",
            "model": "CSRNet"
        }
        r = await client.post("/history", json=post_payload)
        assert r.status_code == 201, f"Status {r.status_code}"
        j = r.json()
        assert "id" in j and j["id"]
        assert j["count"] == 78
        created_id = j["id"]
        record("POST /history", True, f"Created manual entry id={created_id}")
    except Exception as e:
        record("POST /history", False, str(e))

    # 10. GET /history/export.csv
    try:
        r = await client.get("/history/export.csv")
        assert r.status_code == 200, f"Status {r.status_code}"
        assert "text/csv" in r.headers.get("content-type", "")
        assert "ID,Source,Filename,Count,Level,Model,Timestamp" in r.text
        record("GET /history/export.csv", True, f"CSV valid ({len(r.text)} bytes)")
    except Exception as e:
        record("GET /history/export.csv", False, str(e))

    # 11. DELETE /history/{id}
    if created_id:
        try:
            r = await client.delete(f"/history/{created_id}")
            assert r.status_code in [200, 204], f"Status {r.status_code}"
            record("DELETE /history/{id}", True, f"Deleted id={created_id}")
        except Exception as e:
            record("DELETE /history/{id}", False, str(e))
    else:
        record("DELETE /history/{id}", False, "No created_id to delete")

    # 12. GET /stream/live
    try:
        r = await client.get("/stream/live")
        assert r.status_code == 200, f"Status {r.status_code}: {r.text}"
        j = r.json()
        assert "count" in j, f"count missing in {j}"
        assert j["level"] in ["Low", "Medium", "High", "Critical"], f"level invalid: {j.get('level')}"
        assert isinstance(j["zones"], list), f"zones not list: {type(j.get('zones'))}"
        assert "timestamp" in j, f"timestamp missing in {j}"
        zone_dim = f"{len(j['zones'])}x{len(j['zones'][0])}" if j["zones"] else "empty"
        record("GET /stream/live", True, f"count={j['count']}, level={j['level']}, zones={zone_dim}")
    except Exception as e:
        import traceback
        record("GET /stream/live", False, f"{type(e).__name__}: {e}\n{traceback.format_exc()}")

    # 13. WebSocket /ws/stream
    try:
        async with websockets.connect(WS_URL, close_timeout=5) as ws:
            msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
            j = json.loads(msg)
            assert "count" in j
            assert j["level"] in ["Low", "Medium", "High", "Critical"]
            assert "zones" in j
            assert "timestamp" in j
            record("WebSocket /ws/stream", True, f"Message received: count={j['count']}, level={j['level']}")
    except Exception as e:
        record("WebSocket /ws/stream", False, str(e))

    # 14. GET /stream/mjpeg
    try:
        async with client.stream("GET", "/stream/mjpeg") as r:
            assert r.status_code == 200
            assert "multipart/x-mixed-replace" in r.headers.get("content-type", "")
            chunk = b""
            async for data in r.aiter_bytes():
                chunk += data
                if b"--frame" in chunk and len(chunk) > 1000:
                    break
            record("GET /stream/mjpeg", True, f"MJPEG stream chunk verified ({len(chunk)} bytes)")
    except Exception as e:
        record("GET /stream/mjpeg", False, str(e))

    await client.aclose()

    # Summary
    print("\n==========================================")
    total = len(test_results)
    passed = sum(1 for _, p, _ in test_results if p)
    failed = total - passed
    print(f"  TOTAL: {total} | PASSED: {passed} | FAILED: {failed}")
    print("==========================================\n")

    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(run_tests())
