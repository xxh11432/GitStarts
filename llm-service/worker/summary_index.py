"""repoSummary 摘要分块回填：为已有摘要的仓库补写 chunk_type=repo_summary 向量。

用法（容器内）：

    python -m worker.summary_index
    python -m worker.summary_index --force
"""

from __future__ import annotations

import argparse
import asyncio
from typing import Any

import structlog

from app.clients.backend import BackendClient, BackendError
from app.clients.redis import CacheClient
from app.clients.vector import VectorStore
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.services.embedding import EmbeddingService
from worker.embed import EmbeddingCache
from worker.index import index_readme

logger = structlog.get_logger("summary_index")

LOCK_KEY = "index:summary_chunk:lock"
LOCK_TTL_SECONDS = 2 * 3600
PAGE_SIZE = 100
PROGRESS_EVERY = 100


def _repo_payload(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "repoId": int(item.get("repoId") or item.get("id") or 0),
        "fullName": item.get("fullName"),
        "pushedAt": item.get("pushedAt"),
        "language": item.get("language"),
        "category": item.get("category"),
        "license": item.get("license"),
        "platform": item.get("platform"),
        "stars": item.get("stars"),
    }


async def run_summary_index_backfill(
    settings: Settings,
    *,
    backend: BackendClient,
    embedding: EmbeddingCache,
    vector: VectorStore,
    cache: CacheClient | None = None,
    force: bool = False,
) -> dict[str, int]:
    stats = {"processed": 0, "indexed": 0, "skipped": 0, "failed": 0}
    if cache is not None and not await cache.acquire_lock(LOCK_KEY, LOCK_TTL_SECONDS):
        logger.warning("summary_index_locked")
        return stats

    try:
        cursor = 0
        while True:
            page = await backend.list_index_repos(cursor=cursor, limit=PAGE_SIZE)
            items = page.get("items") or []
            if not items:
                break
            for item in items:
                repo_id = int(item.get("repoId") or 0)
                full_name = str(item.get("fullName") or "")
                summary = str(item.get("repoSummary") or "").strip()
                stats["processed"] += 1
                if not repo_id or not full_name or not summary:
                    stats["skipped"] += 1
                    continue
                if not force and await vector.has_chunks(repo_id, "repo_summary"):
                    stats["skipped"] += 1
                    continue
                try:
                    await index_readme(
                        settings,
                        vector,
                        embedding,
                        repo=_repo_payload(item),
                        content=summary,
                        sha=None,
                        source_url=f"https://github.com/{full_name}",
                        chunk_type="repo_summary",
                    )
                    stats["indexed"] += 1
                except (BackendError, ValueError) as exc:
                    stats["failed"] += 1
                    logger.warning(
                        "summary_index_failed",
                        repo=full_name,
                        error=type(exc).__name__,
                        detail=str(exc)[:200],
                    )
                except Exception as exc:  # 单仓失败不阻断整轮
                    stats["failed"] += 1
                    logger.exception(
                        "summary_index_crashed",
                        repo=full_name,
                        error=type(exc).__name__,
                    )
                if stats["processed"] % PROGRESS_EVERY == 0:
                    logger.info("summary_index_progress", **stats)
            next_cursor = page.get("nextCursor")
            if next_cursor is None:
                break
            cursor = int(next_cursor)
        logger.info("summary_index_finished", **stats)
        return stats
    finally:
        if cache is not None:
            await cache.release_lock(LOCK_KEY)


async def main() -> None:
    parser = argparse.ArgumentParser(description="回填 repoSummary 向量分块")
    parser.add_argument("--force", action="store_true", help="重建已有 repo_summary 分块")
    args = parser.parse_args()

    settings = get_settings()
    configure_logging(settings.log_level, json_logs=settings.environment != "local")
    backend = BackendClient(settings)
    vector = VectorStore(settings)
    cache = CacheClient(settings)
    embedding = EmbeddingCache(EmbeddingService(settings))
    logger.info("summary_index_started", force=args.force)
    try:
        await run_summary_index_backfill(
            settings,
            backend=backend,
            embedding=embedding,
            vector=vector,
            cache=cache,
            force=args.force,
        )
    finally:
        await vector.close()
        await cache.close()


if __name__ == "__main__":
    asyncio.run(main())
