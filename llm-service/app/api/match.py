from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator
from typing import Any

import structlog
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.clients.backend import BackendClient, BackendError, QuotaExceededError
from app.clients.llm import LlmNotConfiguredError, build_chat_model
from app.clients.redis import CacheClient
from app.clients.vector import VectorStore
from app.core.config import Settings, get_settings
from app.graphs.match_graph import MatchError, MatchRunner
from app.schemas.match import MatchRequest
from app.services.embedding import EmbeddingService
from app.services.metrics import report_request_metric

logger = structlog.get_logger("match")
router = APIRouter()

_MESSAGES = {
    "quota_exceeded": "今日 AI 次数已用完",
    "idea_not_found": "想法不存在或无权访问",
    "backend_unavailable": "服务暂时不可用，请稍后重试",
    "llm_failed": "AI 解析失败，请稍后重试",
    "empty_requirement": "请先描述你的需求",
    "timeout": "匹配超时了，请缩短描述或稍后重试",
    "match_failed": "匹配失败，请稍后重试",
}


def build_vector(settings: Settings) -> VectorStore:
    return VectorStore(settings)


@router.post("/match")
async def match(request: Request, body: MatchRequest) -> Any:
    settings = get_settings()
    request_id = getattr(request.state, "request_id", "")
    user_id = _user_id(request)
    if user_id is None:
        return JSONResponse(
            status_code=401, content={"code": "unauthorized", "message": "请先登录"}
        )

    if body.idea_id is None and not (body.raw_text or "").strip() and body.structured is None:
        return JSONResponse(
            status_code=400,
            content={
                "code": "empty_requirement",
                "message": "请提供 ideaId、rawText 或 structured",
            },
        )

    try:
        llm = build_chat_model(settings)
    except LlmNotConfiguredError:
        return JSONResponse(
            status_code=503,
            content={"code": "llm_not_configured", "message": "AI 服务尚未配置模型，请联系管理员"},
        )

    backend = BackendClient(settings)
    try:
        quota = await backend.reserve_chat_quota(user_id)
    except QuotaExceededError as exc:
        return JSONResponse(
            status_code=429,
            content={
                "code": "quota_exceeded",
                "message": str(exc),
                "used": exc.used,
                "limit": exc.limit,
                "resetAt": exc.reset_at,
            },
        )
    except BackendError as exc:
        logger.warning("match_quota_failed", error=str(exc))
        return JSONResponse(
            status_code=503,
            content={"code": "backend_unavailable", "message": "服务暂时不可用，请稍后重试"},
        )

    vector = build_vector(settings)
    cache = CacheClient(settings)
    runner = MatchRunner(
        settings=settings,
        backend=backend,
        vector=vector,
        embedding=EmbeddingService(settings),
        llm=llm,
        cache=cache,
    )

    async def event_source() -> AsyncIterator[str]:
        started = time.perf_counter()
        status = "ok"
        cancelled = False
        try:
            async with asyncio.timeout(settings.request_timeout_seconds):
                async for event in runner.run(body, user_id=user_id):
                    yield _sse(event.name, event.data)
        except TimeoutError:
            status = "timeout"
            logger.warning("match_timeout", user_id=user_id)
            yield _sse("error", {"code": "timeout", "message": _MESSAGES["timeout"]})
        except asyncio.CancelledError:
            cancelled = True
            logger.info("match_cancelled", user_id=user_id)
            raise
        except MatchError as exc:
            status = "error"
            logger.warning("match_failed", code=exc.code, error=str(exc))
            yield _sse(
                "error",
                {"code": exc.code, "message": _MESSAGES.get(exc.code, _MESSAGES["match_failed"])},
            )
        except BackendError as exc:
            status = "error"
            logger.warning("match_backend_failed", error=str(exc))
            yield _sse(
                "error",
                {"code": "backend_unavailable", "message": _MESSAGES["backend_unavailable"]},
            )
        except Exception as exc:
            status = "error"
            logger.exception("match_crashed", error=type(exc).__name__)
            yield _sse("error", {"code": "match_failed", "message": _MESSAGES["match_failed"]})
        finally:
            took_ms = int((time.perf_counter() - started) * 1000)
            logger.info(
                "match_finished",
                user_id=user_id,
                request_id=request_id,
                took_ms=took_ms,
                quota=quota.get("chat"),
            )
            if not cancelled:
                await report_request_metric(
                    backend,
                    kind="match",
                    status=status,
                    latency_ms=took_ms,
                    tokens_in=runner.tokens_in,
                    tokens_out=runner.tokens_out,
                    cached=runner.cached,
                )
            await vector.close()
            await cache.close()

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


def _user_id(request: Request) -> int | None:
    raw = request.headers.get("x-user-id")
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
