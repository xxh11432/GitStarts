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
from app.graphs.compare_graph import CompareError, CompareRunner
from app.schemas.compare import CompareRequest
from app.services.embedding import EmbeddingService

logger = structlog.get_logger("compare")
router = APIRouter()

_MESSAGES = {
    "quota_exceeded": "今日 AI 次数已用完",
    "idea_not_found": "想法不存在或无权访问",
    "repo_not_found": "仓库不存在或尚未收录",
    "backend_unavailable": "服务暂时不可用，请稍后重试",
    "invalid_repos": "请选择 2–4 个互不重复的仓库",
    "empty_requirement": "请先描述你的需求",
    "llm_failed": "AI 对比失败，请稍后重试",
    "timeout": "对比超时了，请减少仓库数量或稍后重试",
    "compare_failed": "对比失败，请稍后重试",
}

_STATUS = {
    "invalid_repos": 400,
    "empty_requirement": 400,
    "idea_not_found": 404,
    "repo_not_found": 404,
    "backend_unavailable": 503,
    "llm_failed": 503,
}


@router.post("/compare")
async def compare(request: Request, body: CompareRequest) -> Any:
    settings = get_settings()
    request_id = getattr(request.state, "request_id", "")
    user_id = _user_id(request)
    if user_id is None:
        return JSONResponse(
            status_code=401, content={"code": "unauthorized", "message": "请先登录"}
        )

    if body.idea_id is None and body.structured is None and not (body.raw_text or "").strip():
        return JSONResponse(
            status_code=400,
            content={
                "code": "empty_requirement",
                "message": "请提供 ideaId、rawText 或 structured",
            },
        )

    try:
        llm = build_chat_model(settings, max_tokens=settings.compare_llm_max_tokens)
    except LlmNotConfiguredError:
        return JSONResponse(
            status_code=503,
            content={"code": "llm_not_configured", "message": "AI 服务尚未配置模型，请联系管理员"},
        )

    backend = BackendClient(settings)
    # 配额只读探测：prepare 可能触发 LLM 解析与 idea 落库，必须先拦下已耗尽用户。
    try:
        quota_view = await backend.get_quota(user_id) or {}
    except BackendError as exc:
        logger.warning("compare_quota_probe_failed", error=str(exc))
        return JSONResponse(
            status_code=503,
            content={
                "code": "backend_unavailable",
                "message": _MESSAGES["backend_unavailable"],
            },
        )
    compare_view = quota_view.get("compare") or {}
    probed_used = compare_view.get("used")
    probed_limit = compare_view.get("limit")
    if (
        isinstance(probed_used, int)
        and isinstance(probed_limit, int)
        and probed_used >= probed_limit
    ):
        return JSONResponse(
            status_code=429,
            content={
                "code": "quota_exceeded",
                "message": _MESSAGES["quota_exceeded"],
                "used": probed_used,
                "limit": probed_limit,
                "resetAt": quota_view.get("resetAt"),
            },
        )

    vector = VectorStore(settings)
    cache = CacheClient(settings)
    runner = _build_runner(settings, backend, vector, cache, llm)

    # 先用已解析的需求算 cacheKey：命中缓存时直接回放，不再扣减额度。
    try:
        async with asyncio.timeout(settings.request_timeout_seconds):
            prepared = await runner.prepare(body, user_id=user_id)
    except TimeoutError:
        await runner.close()
        await cache.close()
        return JSONResponse(
            status_code=504, content={"code": "timeout", "message": _MESSAGES["timeout"]}
        )
    except CompareError as exc:
        await runner.close()
        await cache.close()
        return JSONResponse(
            status_code=_STATUS.get(exc.code, 400),
            content={"code": exc.code, "message": str(exc) or _MESSAGES.get(exc.code, "")},
        )
    except BackendError:
        await runner.close()
        await cache.close()
        return JSONResponse(
            status_code=503,
            content={"code": "backend_unavailable", "message": _MESSAGES["backend_unavailable"]},
        )

    quota: dict[str, Any] = {"compare": "cached" if prepared.cached else "reserved"}
    if prepared.cached is None:
        try:
            quota = await backend.reserve_compare_quota(user_id)
        except QuotaExceededError as exc:
            await runner.close()
            await cache.close()
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
            logger.warning("compare_quota_failed", error=str(exc))
            await runner.close()
            await cache.close()
            return JSONResponse(
                status_code=503,
                content={
                    "code": "backend_unavailable",
                    "message": _MESSAGES["backend_unavailable"],
                },
            )

    async def event_source() -> AsyncIterator[str]:
        started = time.perf_counter()
        try:
            async with asyncio.timeout(settings.compare_timeout_seconds):
                async for event in runner.run(prepared, user_id=user_id):
                    yield _sse(event.name, event.data)
        except TimeoutError:
            logger.warning("compare_timeout", user_id=user_id)
            yield _sse("error", {"code": "timeout", "message": _MESSAGES["timeout"]})
        except asyncio.CancelledError:
            # 断流不删除 checkpoint，客户端可凭同一 cacheKey 续跑
            logger.info("compare_cancelled", user_id=user_id)
            raise
        except CompareError as exc:
            logger.warning("compare_failed", code=exc.code, error=str(exc))
            yield _sse(
                "error",
                {"code": exc.code, "message": _MESSAGES.get(exc.code, _MESSAGES["compare_failed"])},
            )
        except BackendError as exc:
            logger.warning("compare_backend_failed", error=str(exc))
            yield _sse(
                "error",
                {"code": "backend_unavailable", "message": _MESSAGES["backend_unavailable"]},
            )
        except Exception as exc:
            logger.exception("compare_crashed", error=type(exc).__name__)
            yield _sse("error", {"code": "compare_failed", "message": _MESSAGES["compare_failed"]})
        finally:
            logger.info(
                "compare_finished",
                user_id=user_id,
                request_id=request_id,
                repos=prepared.repo_keys,
                took_ms=int((time.perf_counter() - started) * 1000),
                quota=quota.get("compare", "reserved"),
            )
            await runner.close()
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


def _build_runner(
    settings: Settings,
    backend: BackendClient,
    vector: VectorStore,
    cache: CacheClient,
    llm: Any,
) -> CompareRunner:
    return CompareRunner(
        settings=settings,
        backend=backend,
        vector=vector,
        embedding=EmbeddingService(settings),
        llm=llm,
        cache=cache,
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
