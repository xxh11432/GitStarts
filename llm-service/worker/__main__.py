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
from worker.pipeline import initialized_key, run_index_pass, run_translation_backfill
from worker.summarize import RepoSummarizer
from worker.translate import ReadmeTranslator

logger = structlog.get_logger("worker")


def build_scheduler(
    settings: Settings,
    backend: BackendClient,
    fetcher: ReadmeFetcher,
    embedding: EmbeddingCache,
    vector: VectorStore,
    cache: CacheClient,
    translator: ReadmeTranslator,
    summarizer: RepoSummarizer,
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
                "translator": translator,
                "summarizer": summarizer,
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
                "translator": translator,
                "summarizer": summarizer,
            },
        )
    if settings.readme_translate_enabled:
        scheduler.add_job(
            translate_backfill,
            "date",
            run_date=datetime.now() + timedelta(seconds=60),
            id="translate_bootstrap",
            replace_existing=True,
            kwargs={
                "settings": settings,
                "backend": backend,
                "embedding": embedding,
                "vector": vector,
                "cache": cache,
                "translator": translator,
            },
        )
        if settings.readme_translate_interval_minutes > 0:
            scheduler.add_job(
                translate_backfill,
                "interval",
                minutes=settings.readme_translate_interval_minutes,
                id="translate_incremental",
                replace_existing=True,
                max_instances=1,
                kwargs={
                    "settings": settings,
                    "backend": backend,
                    "embedding": embedding,
                    "vector": vector,
                    "cache": cache,
                    "translator": translator,
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
    translator: ReadmeTranslator,
    summarizer: RepoSummarizer,
) -> None:
    """首次启动执行全量；完成后打标记，之后只跑增量。"""
    initialized = await cache.get_text(initialized_key(settings))
    full = settings.index_full_rebuild or initialized != "done"
    stats = await run_index_pass(
        settings,
        backend=backend,
        fetcher=fetcher,
        embedding=embedding,
        vector=vector,
        cache=cache,
        translator=translator,
        summarizer=summarizer,
        full=full,
    )
    # 全量轮允许少量脏数据（README/manifest 抓取或 embedding 偶发失败）；
    # 失败率低于 1% 即视为初始化完成，避免个别仓库导致每次重启都重扫全量。
    failure_rate = stats.failed / stats.processed if stats.processed else 1.0
    if full and stats.processed > 0 and failure_rate < 0.01 and not settings.index_max_repos:
        await cache.set_text(initialized_key(settings), "done")
        logger.info("index_initialized", processed=stats.processed, failed=stats.failed)


async def run_incremental(
    *,
    settings: Settings,
    backend: BackendClient,
    fetcher: ReadmeFetcher,
    embedding: EmbeddingCache,
    vector: VectorStore,
    cache: CacheClient,
    translator: ReadmeTranslator,
    summarizer: RepoSummarizer,
) -> None:
    await run_index_pass(
        settings,
        backend=backend,
        fetcher=fetcher,
        embedding=embedding,
        vector=vector,
        cache=cache,
        translator=translator,
        summarizer=summarizer,
        full=False,
    )


async def translate_backfill(
    *,
    settings: Settings,
    backend: BackendClient,
    embedding: EmbeddingCache,
    vector: VectorStore,
    cache: CacheClient,
    translator: ReadmeTranslator,
) -> None:
    """存量 README 语言检测与翻译回填。"""
    await run_translation_backfill(
        settings,
        backend=backend,
        embedding=embedding,
        vector=vector,
        cache=cache,
        translator=translator,
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
    translator = ReadmeTranslator(settings)
    summarizer = RepoSummarizer(settings)

    scheduler = build_scheduler(
        settings, backend, fetcher, embedding, vector, cache, translator, summarizer
    )
    scheduler.start()
    logger.info("worker_started", jobs=[job.id for job in scheduler.get_jobs()])

    try:
        await asyncio.Event().wait()
    finally:
        scheduler.shutdown(wait=False)
        await fetcher.close()
        await vector.close()
        await cache.close()
        await translator.close()
        await summarizer.close()
        logger.info("worker_stopped")


if __name__ == "__main__":
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main())
