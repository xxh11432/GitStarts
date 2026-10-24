"""Ingest worker entry point: `python -m worker`.

全量首建 + 增量索引共用同一条流水线：worker 不直连 MySQL，读写都走 backend
内部接口；Qdrant 与 Redis 由本进程直连。APScheduler 负责定时任务。
"""

import asyncio
import contextlib
from datetime import datetime, timedelta

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.clients.backend import BackendClient
from app.clients.redis import CacheClient
from app.clients.vector import VectorStore
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.services.embedding import EmbeddingService
from worker.embed import EmbeddingCache
from worker.fetch_docs import ReadmeFetcher
from worker.pipeline import INITIALIZED_KEY, run_index_pass

logger = structlog.get_logger("worker")


def build_scheduler(
    settings: Settings,
    backend: BackendClient,
    fetcher: ReadmeFetcher,
    embedding: EmbeddingCache,
    vector: VectorStore,
    cache: CacheClient,
) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="Asia/Shanghai")
    scheduler.add_job(
        lambda: logger.info("worker_heartbeat"),
        "interval",
        minutes=settings.worker_heartbeat_minutes,
        id="heartbeat",
        replace_existing=True,
        max_instances=1,
    )
    if settings.index_interval_minutes > 0:
        scheduler.add_job(
            run_incremental,
            "interval",
            minutes=settings.index_interval_minutes,
            id="index_incremental",
            replace_existing=True,
            max_instances=1,
            kwargs={
                "settings": settings,
                "backend": backend,
                "fetcher": fetcher,
                "embedding": embedding,
                "vector": vector,
                "cache": cache,
            },
        )
    if settings.index_on_startup:
        scheduler.add_job(
            bootstrap_index,
            "date",
            run_date=datetime.now() + timedelta(seconds=3),
            id="index_bootstrap",
            replace_existing=True,
            kwargs={
                "settings": settings,
                "backend": backend,
                "fetcher": fetcher,
                "embedding": embedding,
                "vector": vector,
                "cache": cache,
            },
        )
    return scheduler


async def bootstrap_index(
    *,
    settings: Settings,
    backend: BackendClient,
    fetcher: ReadmeFetcher,
    embedding: EmbeddingCache,
    vector: VectorStore,
    cache: CacheClient,
) -> None:
    """首次启动执行全量；完成后打标记，之后只跑增量。"""
    initialized = await cache.get_text(INITIALIZED_KEY)
    full = settings.index_full_rebuild or initialized != "done"
    stats = await run_index_pass(
        settings,
        backend=backend,
        fetcher=fetcher,
        embedding=embedding,
        vector=vector,
        cache=cache,
        full=full,
    )
    if full and stats.failed == 0 and stats.processed > 0 and not settings.index_max_repos:
        await cache.set_text(INITIALIZED_KEY, "done")
        logger.info("index_initialized")


async def run_incremental(
    *,
    settings: Settings,
    backend: BackendClient,
    fetcher: ReadmeFetcher,
    embedding: EmbeddingCache,
    vector: VectorStore,
    cache: CacheClient,
) -> None:
    await run_index_pass(
        settings,
        backend=backend,
        fetcher=fetcher,
        embedding=embedding,
        vector=vector,
        cache=cache,
        full=False,
    )


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level, json_logs=settings.environment != "local")

    if not settings.worker_enabled:
        logger.warning("worker_disabled")
        return

    backend = BackendClient(settings)
    fetcher = ReadmeFetcher(settings)
    vector = VectorStore(settings)
    cache = CacheClient(settings)
    embedding = EmbeddingCache(EmbeddingService(settings))

    scheduler = build_scheduler(settings, backend, fetcher, embedding, vector, cache)
    scheduler.start()
    logger.info("worker_started", jobs=[job.id for job in scheduler.get_jobs()])

    try:
        await asyncio.Event().wait()
    finally:
        scheduler.shutdown(wait=False)
        await fetcher.close()
        await vector.close()
        await cache.close()
        logger.info("worker_stopped")


if __name__ == "__main__":
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main())
