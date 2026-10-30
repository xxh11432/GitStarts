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
from app.services.embedding import get_embedding_service
from app.services.metrics import report_request_metric
from app.services.quota import (
    commit_ticket,
    release_ticket,
    settle_on_cancel,
    ticket_from,
)

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
    vector = VectorStore(settings)
    cache = CacheClient(settings)
    runner = _build_runner(settings, backend, vector, cache, llm)

    # 先做廉价校验并用请求指纹算 cacheKey：命中缓存直接回放，不扣额度、不触发 LLM。
    try:
        async with asyncio.timeout(settings.request_timeout_seconds):
            prepared = await runner.prepare_light(body, user_id=user_id)
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

    quota: dict[str, Any] = {"compare": "cached"}
    ticket = None
    if prepared.cached is None:
        try:
            quota = await backend.reserve_compare_quota(
                user_id,
                client_key=prepared.fingerprint,
                fingerprint=prepared.fingerprint,
                request_id=request_id,
            )
        except QuotaExceededError as exc:
            await runner.close()
            await cache.close()
            return JSONResponse(
                status_code=429,
                content={
                    "code": exc.code,
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
        ticket = ticket_from(quota, user_id=user_id, kind="compare")

        # 扣费成功后才做 LLM 解析；解析失败立即 release，避免白扣。
        try:
            async with asyncio.timeout(settings.request_timeout_seconds):
                await runner.resolve(prepared, user_id=user_id)
        except TimeoutError:
            await release_ticket(backend, ticket, reason="timeout")
            await runner.close()
            await cache.close()
            return JSONResponse(
                status_code=504, content={"code": "timeout", "message": _MESSAGES["timeout"]}
            )
        except CompareError as exc:
            await release_ticket(backend, ticket, reason=exc.code)
            await runner.close()
            await cache.close()
            return JSONResponse(
                status_code=_STATUS.get(exc.code, 400),
                content={"code": exc.code, "message": str(exc) or _MESSAGES.get(exc.code, "")},
            )
        except BackendError:
            await release_ticket(backend, ticket, reason="backend_unavailable")
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
        status = "ok"
        cancelled = False
        cell_count = 0
        try:
            async with asyncio.timeout(settings.compare_timeout_seconds):
                async for event in runner.run(prepared, user_id=user_id):
                    if event.name == "cell":
                        cell_count += 1
                    yield _sse(event.name, event.data)
        except TimeoutError:
            status = "timeout"
            logger.warning("compare_timeout", user_id=user_id)
            yield _sse("error", {"code": "timeout", "message": _MESSAGES["timeout"]})
        except asyncio.CancelledError:
            # 断流不删除 checkpoint，客户端可凭同一 cacheKey 续跑
            cancelled = True
            logger.info("compare_cancelled", user_id=user_id)
            raise
        except CompareError as exc:
            status = "error"
            logger.warning("compare_failed", code=exc.code, error=str(exc))
            yield _sse(
                "error",
                {"code": exc.code, "message": _MESSAGES.get(exc.code, _MESSAGES["compare_failed"])},
            )
        except BackendError as exc:
            status = "error"
            logger.warning("compare_backend_failed", error=str(exc))
            yield _sse(
                "error",
                {"code": "backend_unavailable", "message": _MESSAGES["backend_unavailable"]},
            )
        except Exception as exc:
            status = "error"
            logger.exception("compare_crashed", error=type(exc).__name__)
            yield _sse("error", {"code": "compare_failed", "message": _MESSAGES["compare_failed"]})
        finally:
            took_ms = int((time.perf_counter() - started) * 1000)
            logger.info(
                "compare_finished",
                user_id=user_id,
                request_id=request_id,
                repos=prepared.repo_keys,
                took_ms=took_ms,
                quota=quota.get("compare", "reserved"),
            )
            if not cancelled:
                await report_request_metric(
                    backend,
                    kind="compare",
                    status=status,
                    latency_ms=took_ms,
                    tokens_in=runner.tokens_in,
                    tokens_out=runner.tokens_out,
                    cached=runner.cached,
                )
            if ticket is not None:
                # 已有 cell / checkpoint 的断流保留 reserved，续跑同键不再扣；
                # 一个 cell 都没产出才归还。
                has_output = cell_count > 0 or prepared.checkpoint is not None
                if cancelled:
                    if not has_output:
                        await settle_on_cancel(
                            backend,
                            ticket,
                            commit=False,
                            reason="cancelled",
                        )
                elif status == "ok":
                    await commit_ticket(
                        backend,
                        ticket,
                        tokens_in=runner.tokens_in,
                        tokens_out=runner.tokens_out,
                        request_id=request_id,
                    )
                elif not has_output:
                    await release_ticket(backend, ticket, reason=status)
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
        embedding=get_embedding_service(settings),
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
