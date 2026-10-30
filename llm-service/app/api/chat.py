from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

import structlog
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from app.clients.backend import BackendClient, BackendError, QuotaExceededError
from app.clients.llm import LlmNotConfiguredError, build_chat_model
from app.core.config import Settings, get_settings
from app.graphs.chat_graph import SYSTEM_PROMPT, TIMEOUT_TEXT, ChatRunner
from app.graphs.state import ChatState
from app.schemas.chat import ChatRequest
from app.services.metrics import report_request_metric
from app.services.persistence import (
    conversation_title,
    persist_conversation,
    persist_message,
)
from app.services.quota import (
    commit_ticket,
    release_ticket,
    settle_on_cancel,
    ticket_from,
)
from app.tools.repo_tools import TOOL_SCHEMAS, RepoToolExecutor

logger = structlog.get_logger("chat")
router = APIRouter()

_CHAT_FAILED = "对话生成失败，请稍后重试"
_CONVERSATION_MISSING = "会话不存在或无权访问"


def build_backend(settings: Settings) -> BackendClient:
    return BackendClient(settings)


def build_llm(settings: Settings) -> Any:
    model = build_chat_model(settings)
    return model.bind_tools(TOOL_SCHEMAS)


@router.post("/chat/stream")
async def chat_stream(request: Request, body: ChatRequest) -> Any:
    settings = get_settings()
    request_id = getattr(request.state, "request_id", "")

    user_id = _user_id(request)
    if user_id is None:
        return JSONResponse(
            status_code=401,
            content={"code": "unauthorized", "message": "请先登录"},
        )

    if not body.messages:
        return JSONResponse(
            status_code=400,
            content={"code": "empty_messages", "message": "消息不能为空"},
        )

    try:
        llm = build_llm(settings)
    except LlmNotConfiguredError:
        logger.warning("llm_not_configured")
        return JSONResponse(
            status_code=503,
            content={"code": "llm_not_configured", "message": "AI 服务尚未配置模型，请联系管理员"},
        )

    backend = build_backend(settings)
    user_text = _last_user_text(body)

    # 扣费前先做会话归属校验：非法 conversationId 不能白扣一次额度
    if body.conversation_id is not None:
        try:
            await backend.get_conversation(body.conversation_id, user_id=user_id)
        except BackendError as exc:
            if exc.status == 404:
                return JSONResponse(
                    status_code=404,
                    content={"code": "conversation_not_found", "message": _CONVERSATION_MISSING},
                )
            logger.warning("chat_conversation_check_failed", error=str(exc))
            return JSONResponse(
                status_code=503,
                content={"code": "backend_unavailable", "message": "服务暂时不可用，请稍后重试"},
            )

    client_key = body.turn_id or request_id or uuid.uuid4().hex
    fingerprint = hashlib.sha256(user_text.encode("utf-8")).hexdigest()[:32]
    try:
        quota = await backend.reserve_chat_quota(
            user_id,
            client_key=client_key,
            fingerprint=fingerprint,
            request_id=request_id,
        )
    except QuotaExceededError as exc:
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
        logger.warning("quota_reserve_failed", error=str(exc))
        return JSONResponse(
            status_code=503,
            content={"code": "backend_unavailable", "message": "服务暂时不可用，请稍后重试"},
        )

    ticket = ticket_from(quota, user_id=user_id, kind="chat")
    history = _build_messages(body, settings.chat_history_limit)
    state = ChatState(messages=history, tool_budget=settings.chat_tool_round_limit)

    conversation_id = body.conversation_id
    if conversation_id is None:
        conversation_id = await persist_conversation(
            backend,
            user_id=user_id,
            idea_id=body.idea_id,
            title=conversation_title(_last_user_text(body)),
            attempts=settings.chat_persist_retries + 1,
        )

    runner = ChatRunner(
        llm=llm,
        tools=RepoToolExecutor(backend),
        state=state,
        retries=settings.llm_max_retries,
    )

    if body.persist_user:
        await persist_message(
            backend,
            conversation_id=conversation_id,
            user_id=user_id,
            role="user",
            content=user_text,
            attempts=settings.chat_persist_retries + 1,
        )

    async def event_source() -> AsyncIterator[str]:
        started = time.perf_counter()
        yield _sse(
            "meta",
            {
                "conversationId": conversation_id,
                "requestId": request_id,
                "quota": quota,
            },
        )

        failed = False
        status = "ok"
        try:
            async with asyncio.timeout(settings.request_timeout_seconds):
                async for event in runner.run():
                    yield _sse(event.name, event.data)
        except TimeoutError:
            failed = True
            status = "timeout"
            logger.warning("chat_timeout", conversation_id=conversation_id)
            yield _sse("error", {"code": "timeout", "message": TIMEOUT_TEXT})
        except asyncio.CancelledError:
            logger.info("chat_cancelled", conversation_id=conversation_id)
            await settle_on_cancel(
                backend,
                ticket,
                commit=bool(runner.answer.strip()),
                tokens_in=state.tokens_in,
                tokens_out=state.tokens_out,
                reason="cancelled",
            )
            raise
        except Exception as exc:
            failed = True
            status = "error"
            logger.exception("chat_failed", error=type(exc).__name__)
            yield _sse("error", {"code": "chat_failed", "message": _CHAT_FAILED})

        took_ms = int((time.perf_counter() - started) * 1000)
        await report_request_metric(
            backend,
            kind="chat",
            status=status,
            latency_ms=took_ms,
            tokens_in=state.tokens_in,
            tokens_out=state.tokens_out,
        )
        # 有产出（含部分回答）即 commit；完全没产出才归还，避免超时/失败白扣
        if runner.answer.strip():
            await commit_ticket(
                backend,
                ticket,
                tokens_in=state.tokens_in,
                tokens_out=state.tokens_out,
                request_id=request_id,
            )
        else:
            await release_ticket(backend, ticket, reason=status)
        if not failed:
            yield _sse(
                "done",
                {
                    "conversationId": conversation_id,
                    "tookMs": took_ms,
                    "tokensIn": state.tokens_in,
                    "tokensOut": state.tokens_out,
                    "refs": len(state.refs),
                },
            )

        await persist_message(
            backend,
            conversation_id=conversation_id,
            user_id=user_id,
            role="assistant",
            content=runner.answer,
            attempts=settings.chat_persist_retries + 1,
            tool_trace=state.tool_trace,
            refs=state.refs,
            tokens_in=state.tokens_in or None,
            tokens_out=state.tokens_out or None,
        )

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


def _build_messages(body: ChatRequest, history_limit: int) -> list[BaseMessage]:
    trimmed = body.messages[-history_limit:]
    messages: list[BaseMessage] = [SystemMessage(content=SYSTEM_PROMPT)]
    for message in trimmed:
        if message.role == "assistant":
            messages.append(AIMessage(content=message.content))
        else:
            messages.append(HumanMessage(content=message.content))
    return messages


def _last_user_text(body: ChatRequest) -> str:
    for message in reversed(body.messages):
        if message.role == "user":
            return message.content
    return ""


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
