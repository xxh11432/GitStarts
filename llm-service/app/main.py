from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api import chat, compare, health, match
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware

logger = structlog.get_logger("app")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, json_logs=settings.environment != "local")

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        logger.info(
            "service_started",
            service=settings.app_name,
            version=settings.app_version,
            environment=settings.environment,
        )
        yield
        logger.info("service_stopped", service=settings.app_name)

    app = FastAPI(
        title="GitStars AI Gateway",
        version=settings.app_version,
        docs_url="/ai/docs",
        openapi_url="/ai/openapi.json",
        lifespan=lifespan,
    )
    app.add_middleware(RequestContextMiddleware)
    app.include_router(health.router, prefix="/ai", tags=["health"])
    app.include_router(chat.router, prefix="/ai", tags=["chat"])
    app.include_router(match.router, prefix="/ai", tags=["match"])
    app.include_router(compare.router, prefix="/ai", tags=["compare"])

    @app.exception_handler(Exception)
    async def unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
        logger.error("unhandled_exception", error=type(exc).__name__, exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={
                "code": "internal_error",
                "message": "服务内部错误",
                "requestId": getattr(request.state, "request_id", ""),
            },
        )

    return app


app = create_app()
