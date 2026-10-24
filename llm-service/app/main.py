import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api import chat, compare, health, match
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.services.embedding import EmbeddingService

logger = structlog.get_logger("app")


async def _warm_embedding(settings: Settings) -> None:
    """启动后预热 embedding，避免首次匹配把模型加载时间算进超时预算。"""
    try:
        await EmbeddingService(settings).embed_query("warmup")
        logger.info("embedding_warmed", model=settings.llm_embedding_model)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning("embedding_warm_failed", error=type(exc).__name__)


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
        warm_task = asyncio.create_task(_warm_embedding(settings))
        yield
        warm_task.cancel()
        with suppress(asyncio.CancelledError):
            await warm_task
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
