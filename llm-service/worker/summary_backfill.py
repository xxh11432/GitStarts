"""仓库摘要并发回填：只处理 repo_summary 为空的仓库，直接读文档库里的已存 README。

独立于索引主流程，串行处理：模型账号按分钟限流（60 rpm），并发只会换来 429，
所以一次只发一条请求，靠 SUMMARY_BACKFILL_RPS 控制放行节奏。
用法（容器内）：

    python -m worker.summary_backfill
    SUMMARY_BACKFILL_RPS=1.0 python -m worker.summary_backfill
"""

from __future__ import annotations

import asyncio
import time

import structlog

from app.clients.backend import BackendClient, BackendError
from app.clients.redis import CacheClient
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from worker.summarize import RepoSummarizer, SummaryError, build_metadata, fallback_summary

logger = structlog.get_logger("summary_backfill")

LOCK_KEY = "index:summary_backfill:lock"
LOCK_TTL_SECONDS = 2 * 3600
PAGE_SIZE = 100
PROGRESS_EVERY = 100


class _RateLimiter:
    """全局按秒放行；遇到 429 只做一次全局冷却，不永久压低速率。"""

    def __init__(self, rps: float) -> None:
        self._interval = 1.0 / rps if rps and rps > 0 else 0.0
        self._lock = asyncio.Lock()
        self._next_at = 0.0

    async def acquire(self) -> None:
        if self._interval <= 0:
            return
        async with self._lock:
            now = time.monotonic()
            wait = self._next_at - now
            if wait > 0:
                await asyncio.sleep(wait)
            self._next_at = max(time.monotonic(), self._next_at) + self._interval

    def cooldown(self, seconds: float) -> None:
        """429：全体暂停若干秒后重新刺探，避免把放行间隔永久拉长。"""
        self._next_at = max(self._next_at, time.monotonic() + seconds)


def _is_rate_limited(exc: Exception) -> bool:
    return "429" in str(exc)


async def _process_item(
    item: dict[str, object],
    *,
    backend: BackendClient,
    summarizer: RepoSummarizer,
    limiter: _RateLimiter,
) -> bool:
    repo_id = int(item.get("repoId") or 0)
    full_name = str(item.get("fullName") or "")
    if not repo_id or not full_name:
        return False
    metadata = build_metadata(item)
    readme = ""
    try:
        stored = await backend.get_repo_readme(repo_id)
        readme = str(stored.get("content") or "")
    except BackendError as exc:
        logger.warning("summary_readme_fetch_failed", repo=full_name, detail=str(exc)[:200])
    if not readme:
        # 没有正文只能写规则摘要；有正文时失败一律不写，留待下一轮重试
        await backend.update_repo_summary(repo_id, fallback_summary(metadata))
        return True

    # 429 时全局冷却 5 秒再刺探一次；其余异常直接留给下一轮
    for probe in range(2):
        await limiter.acquire()
        try:
            summary = await summarizer.summarize(readme=readme, metadata=metadata)
        except SummaryError as exc:
            if _is_rate_limited(exc) and probe == 0:
                limiter.cooldown(5.0)
                logger.info("summary_rate_limited_probe", repo=full_name)
                continue
            logger.warning("summary_failed", repo=full_name, detail=str(exc)[:200])
            raise
        await backend.update_repo_summary(repo_id, summary)
        return True
    return False


async def run_summary_backfill(
    settings: Settings,
    *,
    backend: BackendClient,
    summarizer: RepoSummarizer,
    cache: CacheClient | None = None,
) -> dict[str, int]:
    stats = {"processed": 0, "succeeded": 0, "failed": 0, "skipped": 0}
    if cache is not None and not await cache.acquire_lock(LOCK_KEY, LOCK_TTL_SECONDS):
        logger.warning("summary_backfill_locked")
        return stats

    limiter = _RateLimiter(settings.summary_backfill_rps)
    try:
        cursor = 0
        while True:
            page = await backend.list_index_repos(cursor=cursor, limit=PAGE_SIZE)
            items = page.get("items") or []
            if not items:
                break
            for item in items:
                if item.get("repoSummary"):
                    stats["skipped"] += 1
                    continue
                try:
                    ok = await _process_item(
                        item,
                        backend=backend,
                        summarizer=summarizer,
                        limiter=limiter,
                    )
                except Exception as exc:  # 单条失败不阻断整轮回填
                    stats["failed"] += 1
                    logger.warning(
                        "summary_backfill_crashed",
                        repo=item.get("fullName"),
                        error=type(exc).__name__,
                    )
                else:
                    if ok:
                        stats["succeeded"] += 1
                stats["processed"] += 1
                if stats["processed"] % PROGRESS_EVERY == 0:
                    logger.info("summary_backfill_progress", **stats)
            next_cursor = page.get("nextCursor")
            if next_cursor is None:
                break
            cursor = int(next_cursor)
        logger.info("summary_backfill_finished", **stats)
        return stats
    finally:
        if cache is not None:
            await cache.release_lock(LOCK_KEY)


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level, json_logs=settings.environment != "local")
    backend = BackendClient(settings)
    summarizer = RepoSummarizer(settings)
    cache = CacheClient(settings)
    logger.info(
        "summary_backfill_started",
        rps=settings.summary_backfill_rps,
    )
    try:
        await run_summary_backfill(
            settings, backend=backend, summarizer=summarizer, cache=cache
        )
    finally:
        await summarizer.close()
        await cache.close()


if __name__ == "__main__":
    asyncio.run(main())
