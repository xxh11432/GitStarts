"""配额两阶段终态：成功 commit、失败/取消 release，结算失败只记日志不打断主链路。"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import structlog

from app.clients.backend import BackendClient

logger = structlog.get_logger("quota")


@dataclass(frozen=True)
class QuotaTicket:
    user_id: int
    kind: str
    idem_key: str
    used: int | None = None
    limit: int | None = None


def ticket_from(quota: dict[str, Any] | None, *, user_id: int, kind: str) -> QuotaTicket | None:
    if not isinstance(quota, dict):
        return None
    idem_key = quota.get("idemKey") or quota.get("idem_key")
    if not idem_key:
        return None
    return QuotaTicket(
        user_id=user_id,
        kind=kind,
        idem_key=str(idem_key),
        used=quota.get("used"),
        limit=quota.get("limit"),
    )


async def commit_ticket(
    backend: BackendClient,
    ticket: QuotaTicket | None,
    *,
    tokens_in: int = 0,
    tokens_out: int = 0,
    request_id: str | None = None,
) -> None:
    if ticket is None:
        return
    try:
        accepted = await backend.commit_quota(
            user_id=ticket.user_id,
            kind=ticket.kind,
            idem_key=ticket.idem_key,
            tokens_in=max(tokens_in, 0),
            tokens_out=max(tokens_out, 0),
            request_id=request_id,
        )
        if not accepted:
            logger.error(
                "quota_commit_rejected",
                idem_key=ticket.idem_key,
                kind=ticket.kind,
            )
    except Exception as exc:  # 账本结算失败由 reaper / 对账兜底
        logger.error(
            "quota_commit_failed",
            idem_key=ticket.idem_key,
            kind=ticket.kind,
            error=type(exc).__name__,
        )


async def release_ticket(
    backend: BackendClient,
    ticket: QuotaTicket | None,
    *,
    reason: str | None = None,
) -> None:
    if ticket is None:
        return
    try:
        accepted = await backend.release_quota(
            user_id=ticket.user_id,
            kind=ticket.kind,
            idem_key=ticket.idem_key,
            reason=reason,
        )
        if not accepted:
            logger.error(
                "quota_release_rejected",
                idem_key=ticket.idem_key,
                kind=ticket.kind,
            )
    except Exception as exc:
        logger.error(
            "quota_release_failed",
            idem_key=ticket.idem_key,
            kind=ticket.kind,
            error=type(exc).__name__,
        )


async def settle_on_cancel(
    backend: BackendClient,
    ticket: QuotaTicket | None,
    *,
    commit: bool,
    tokens_in: int = 0,
    tokens_out: int = 0,
    reason: str = "cancelled",
) -> None:
    """客户端断流 / 任务被取消时，用 shield 保护结算请求完成。"""
    if ticket is None:
        return
    if commit:
        action = commit_ticket(
            backend, ticket, tokens_in=tokens_in, tokens_out=tokens_out
        )
    else:
        action = release_ticket(backend, ticket, reason=reason)
    task = asyncio.create_task(action)
    try:
        await asyncio.shield(task)
    except asyncio.CancelledError:
        # 结算任务继续在后台跑完，不能因为外层取消而丢失归还
        logger.info("quota_settle_detached", idem_key=ticket.idem_key)
