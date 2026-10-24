import time
import uuid
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import AppError, PayloadTooLargeError
from app.core.logging import logger, setup_logging

setup_logging(debug=settings.DEBUG)

app = FastAPI(
    title="Gurukul AI API",
    version="0.1.0",
    description="Manufacturing Knowledge Capture, Validation, and Training Platform API",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/api/v1/openapi.json",
)

# CORS Middleware (Credentials must be allowed for HttpOnly cookies)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "Content-Disposition", "Content-Range", "Accept-Ranges"],
)


@app.middleware("http")
async def payload_size_limit_middleware(request: Request, call_next):
    """Enforces body-size limits before and during multipart parsing."""
    if request.method == "POST" and "/media" in request.url.path:
        content_length_header = request.headers.get("content-length")
        if content_length_header:
            try:
                cl = int(content_length_header)
                if cl > settings.MAX_UPLOAD_BYTES + 65536:
                    request_id = getattr(request.state, "request_id", None) or f"req_{uuid.uuid4().hex[:12]}"
                    return JSONResponse(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        content={
                            "error": {
                                "code": "payload_too_large",
                                "message": f"Upload size exceeds maximum allowed limit of {settings.MAX_UPLOAD_BYTES} bytes.",
                                "details": None,
                                "request_id": request_id,
                            }
                        },
                    )
            except ValueError:
                pass

        original_receive = request._receive
        bytes_received = 0
        max_allowed = settings.MAX_UPLOAD_BYTES + 65536

        async def counting_receive():
            nonlocal bytes_received
            message = await original_receive()
            if message["type"] == "http.request":
                bytes_received += len(message.get("body", b""))
                if bytes_received > max_allowed:
                    raise PayloadTooLargeError(
                        code="payload_too_large",
                        message=f"Upload payload exceeds maximum allowed limit of {settings.MAX_UPLOAD_BYTES} bytes.",
                    )
            return message

        request._receive = counting_receive

    return await call_next(request)


@app.middleware("http")
async def request_id_and_timing_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or f"req_{uuid.uuid4().hex[:12]}"
    request.state.request_id = request_id
    start_time = time.perf_counter()

    try:
        response = await call_next(request)
    except Exception as exc:
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.error(
            f"Unhandled exception in request {request_id}: {exc} (took {duration_ms}ms)"
        )
        raise exc

    duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time-Ms"] = str(duration_ms)

    # Log non-healthcheck requests
    if "/health" not in request.url.path:
        logger.info(
            f"[{request_id}] {request.method} {request.url.path} -> {response.status_code} ({duration_ms}ms)"
        )

    return response


# Global Exception Handlers conforming strictly to API_CONVENTIONS.md
@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    request_id = getattr(request.state, "request_id", None)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
                "request_id": request_id,
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", None)
    formatted_errors = []
    for err in exc.errors():
        loc = " -> ".join(str(l) for l in err.get("loc", []))
        formatted_errors.append(f"{loc}: {err.get('msg')}")

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "validation_error",
                "message": "Input validation failed.",
                "details": formatted_errors,
                "request_id": request_id,
            }
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None)
    logger.exception(f"Unhandled server error on request {request_id}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "internal_error",
                "message": "An unexpected server error occurred.",
                "details": None,
                "request_id": request_id,
            }
        },
    )


# Mount API v1 router
app.include_router(api_router, prefix="/api/v1")


# Root health alias for convenience
@app.get("/health", include_in_schema=False)
def root_health():
    return JSONResponse(content={"status": "ok", "message": "Gurukul AI Gateway Online"})
