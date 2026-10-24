from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

import structlog

from app.clients.backend import BackendClient

logger = structlog.get_logger("persistence")


async def retry_async[T](
    action: Callable[[], Awaitable[T]],
    *,
    attempts: int,
    label: str,
    base_delay: float = 0.2,
) -> T | None:
    """失败重试；最终失败只记日志并丢弃，绝不影响对话主链路。"""
    total = max(1, attempts)
    for attempt in range(total):
        try:
            return await action()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if attempt == total - 1:
                logger.warning(
                    "persist_failed", label=label, attempts=total, error=type(exc).__name__
                )
                return None
            await asyncio.sleep(base_delay * (attempt + 1))
    return None


async def persist_conversation(
    backend: BackendClient,
    *,
    user_id: int,
    idea_id: int | None,
    title: str,
    attempts: int,
) -> int | None:
    return await retry_async(
        lambda: backend.create_conversation(
            user_id=user_id, mode="chat", idea_id=idea_id, title=title
        ),
        attempts=attempts,
        label="conversation",
    )


async def persist_message(
    backend: BackendClient,
    *,
    conversation_id: int | None,
    user_id: int,
    role: str,
    content: str,
    attempts: int,
    tool_trace: list[dict[str, Any]] | None = None,
    refs: list[dict[str, Any]] | None = None,
    tokens_in: int | None = None,
    tokens_out: int | None = None,
) -> None:
    if conversation_id is None or not content.strip():
        return
    await retry_async(
        lambda: backend.append_message(
            conversation_id=conversation_id,
            user_id=user_id,
            role=role,
            content=content,
            tool_trace=tool_trace,
            refs=refs,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
        ),
        attempts=attempts,
        label=f"message:{role}",
    )


def conversation_title(text: str, *, max_length: int = 60) -> str:
    cleaned = " ".join(text.split())
    return cleaned[:max_length] if cleaned else "新的对话"
