"""请求指标上报：失败只记日志，绝不影响 SSE 主链路。"""

from __future__ import annotations

import structlog

from app.clients.backend import BackendClient

logger = structlog.get_logger("metrics")


async def report_request_metric(
    backend: BackendClient,
    *,
    kind: str,
    status: str,
    latency_ms: int,
    tokens_in: int = 0,
    tokens_out: int = 0,
    cached: bool = False,
) -> None:
    try:
        await backend.record_ai_metric(
            kind=kind,
            status=status,
            latency_ms=latency_ms,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cached=cached,
        )
    except Exception as exc:  # 指标链路独立于业务，失败降级为日志
        logger.warning(
            "metric_report_failed", kind=kind, status=status, error=type(exc).__name__
        )
