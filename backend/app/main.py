import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import OUTPUTS_DIR, CORS_ORIGINS, DEBUG
from db.database import init_db, SessionLocal
from app.routes.settings import get_or_create_settings
from services.stream_service import stream_manager

from app.routes.health import router as health_router
from app.routes.settings import router as settings_router
from app.routes.metrics import router as metrics_router
from app.routes.history import router as history_router
from app.routes.preprocess import router as preprocess_router
from app.routes.predict import router as predict_router
from app.routes.stream import router as stream_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database and models
    init_db()
    # Ensure sample crowd image exists
    from services.preprocess_service import get_latest_or_sample_image
    get_latest_or_sample_image()
    yield

app = FastAPI(
    title="Crowd Density Estimation System API",
    description="CSE Final Year Project - Dept. of CSE, GECT. Computer Vision Backend for Real-time Crowd Counting.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# 1. Custom Middleware for Private Network Preflight & Headers
@app.middleware("http")
async def add_private_network_headers(request: Request, call_next):
    # Handle preflight options with Access-Control-Request-Private-Network
    if request.method == "OPTIONS":
        response = Response(status_code=204)
    else:
        try:
            response = await call_next(request)
        except Exception as exc:
            # Fallback in case exception bypasses handlers
            return JSONResponse(status_code=500, content={"detail": str(exc)})

    # Chrome / Edge Private Network Access header
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

# 2. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"]
)

# 3. Global Exception Handlers (Ensuring JSON format for all errors, no raw HTML)
@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail if isinstance(exc.detail, str) else str(exc.detail)}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    error_messages = []
    for err in exc.errors():
        loc = " -> ".join(str(l) for l in err.get("loc", []))
        msg = err.get("msg", "Invalid value")
        error_messages.append(f"{loc}: {msg}")
    return JSONResponse(
        status_code=422,
        content={"detail": "; ".join(error_messages)}
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"[GlobalException] Unhandled error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"}
    )

# 4. Static Files Mount (/outputs)
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")

# 5. Dedicated WebSocket Route for /ws/stream (as specified in frontend contract)
@app.websocket("/ws/stream")
async def websocket_stream_endpoint(websocket: WebSocket):
    await websocket.accept()
    db = SessionLocal()
    import asyncio
    try:
        while True:
            settings = get_or_create_settings(db)
            data = stream_manager.get_live_data(settings)
            await websocket.send_text(json.dumps(data))
            await asyncio.sleep(1.0)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        db.close()

# 6. Include API Routers
app.include_router(health_router)
app.include_router(settings_router)
app.include_router(metrics_router)
app.include_router(history_router)
app.include_router(preprocess_router)
app.include_router(predict_router)
app.include_router(stream_router)
