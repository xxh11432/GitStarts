"""Ingest worker entry point: `python -m worker`.

Shares the image with the API but runs a separate process. M0 only registers a
heartbeat job; M4 adds fetch/chunk/embed/index jobs on the same scheduler.
"""

import asyncio
import contextlib

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.config import get_settings
from app.core.logging import configure_logging

logger = structlog.get_logger("worker")


async def heartbeat() -> None:
    logger.info("worker_heartbeat")


def build_scheduler() -> AsyncIOScheduler:
    settings = get_settings()
    scheduler = AsyncIOScheduler(timezone="Asia/Shanghai")
    scheduler.add_job(
        heartbeat,
        "interval",
        minutes=settings.worker_heartbeat_minutes,
        id="heartbeat",
        replace_existing=True,
        max_instances=1,
    )
    return scheduler


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level, json_logs=settings.environment != "local")

    if not settings.worker_enabled:
        logger.warning("worker_disabled")
        return

    scheduler = build_scheduler()
    scheduler.start()
    logger.info("worker_started", jobs=[job.id for job in scheduler.get_jobs()])

    try:
        await asyncio.Event().wait()
    finally:
        scheduler.shutdown(wait=False)
        logger.info("worker_stopped")


if __name__ == "__main__":
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main())
