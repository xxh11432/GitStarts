"""索引流水线：拉取 → 清洗 → 分块 → embedding → Qdrant，支持断点续跑与 Redis 锁。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import structlog

from app.clients.backend import BackendClient, BackendError
from app.clients.redis import CacheClient
from app.clients.vector import VectorStore
from app.core.config import Settings
from worker.embed import EmbeddingCache
from worker.fetch_docs import GithubFetchError, ReadmeFetcher
from worker.index import index_readme

logger = structlog.get_logger("pipeline")

CURSOR_KEY = "index:cursor"
FULL_CURSOR_KEY = "index:full_cursor"
LOCK_KEY = "index:lock"
INITIALIZED_KEY = "index:initialized"
LOCK_TTL_SECONDS = 4 * 60 * 60
MANIFEST_MARKER_TTL_SECONDS = 90 * 24 * 3600


def _collection_key(settings: Settings, prefix: str) -> str:
    return f"{prefix}:{settings.qdrant_collection}"


def initialized_key(settings: Settings) -> str:
    """按集合名隔离初始化标记：更换 embedding 模型并切到新集合后自动全量重建。"""
    return _collection_key(settings, INITIALIZED_KEY)


@dataclass
class IndexStats:
    processed: int = 0
    indexed: int = 0
    skipped: int = 0
    failed: int = 0
    chunks: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "processed": self.processed,
            "indexed": self.indexed,
            "skipped": self.skipped,
            "failed": self.failed,
            "chunks": self.chunks,
        }


def _needs_index(item: dict[str, Any]) -> bool:
    indexed_at = item.get("docsIndexedAt")
    if not indexed_at:
        return True
    pushed_at = item.get("pushedAt")
    if not pushed_at:
        return False
    return str(pushed_at) > str(indexed_at)


async def run_index_pass(
    settings: Settings,
    *,
    backend: BackendClient,
    fetcher: ReadmeFetcher,
    embedding: EmbeddingCache,
    vector: VectorStore,
    cache: CacheClient,
    full: bool = False,
) -> IndexStats:
    stats = IndexStats()
    if not await cache.acquire_lock(LOCK_KEY, LOCK_TTL_SECONDS):
        logger.warning("index_locked")
        return stats

    try:
        await vector.ensure_collection()
        # 游标按集合隔离，避免切换 embedding 模型后从旧集合的断点续跑
        cursor_key = _collection_key(settings, FULL_CURSOR_KEY if full else CURSOR_KEY)
        saved_cursor = await cache.get_text(cursor_key)
        cursor = int(saved_cursor) if saved_cursor else 0
        if full and saved_cursor:
            logger.info("index_full_resumed", cursor=cursor)
        logger.info("index_pass_started", full=full, cursor=cursor)
        stopped = False

        while not stopped:
            page = await backend.list_index_repos(cursor=cursor, limit=settings.index_page_size)
            items = page.get("items") or []
            if not items:
                break

            for item in items:
                if settings.index_max_repos and stats.processed >= settings.index_max_repos:
                    stopped = True
                    break

                repo_id = int(item.get("repoId") or 0)
                full_name = str(item.get("fullName") or "")
                if not repo_id or not full_name:
                    continue

                stats.processed += 1
                needs_readme = full or not item.get("docsIndexedAt") or _needs_index(item)
                manifest_key = _manifest_key(settings, item)
                needs_manifest = settings.index_manifests_enabled and not await cache.get_text(
                    manifest_key
                )
                if not needs_readme and not needs_manifest:
                    stats.skipped += 1
                    await cache.set_text(cursor_key, str(repo_id))
                    continue

                try:
                    outcome = await _index_item(
                        settings,
                        backend=backend,
                        fetcher=fetcher,
                        embedding=embedding,
                        vector=vector,
                        cache=cache,
                        item=item,
                        full=full or not item.get("docsIndexedAt"),
                        index_readme_docs=needs_readme,
                        index_manifest=needs_manifest,
                        manifest_key=manifest_key,
                    )
                    if outcome == "indexed":
                        stats.indexed += 1
                    else:
                        stats.skipped += 1
                    await backend.mark_indexed([repo_id])
                except (BackendError, GithubFetchError, ValueError) as exc:
                    stats.failed += 1
                    logger.warning(
                        "index_failed",
                        repo=full_name,
                        error=type(exc).__name__,
                        detail=str(exc)[:200],
                    )
                except Exception as exc:  # 单个仓库失败不阻断整轮
                    stats.failed += 1
                    logger.exception("index_crashed", repo=full_name, error=type(exc).__name__)

                await cache.set_text(cursor_key, str(repo_id))

            next_cursor = page.get("nextCursor")
            if stopped or next_cursor is None:
                break
            cursor = int(next_cursor)

        if stopped:
            logger.info("index_pass_paused", full=full, **stats.as_dict())
        else:
            if full:
                await cache.delete(cursor_key)
            else:
                await cache.set_text(cursor_key, "0")
            logger.info("index_pass_finished", full=full, **stats.as_dict())
        return stats
    finally:
        await cache.release_lock(LOCK_KEY)


async def _index_item(
    settings: Settings,
    *,
    backend: BackendClient,
    fetcher: ReadmeFetcher,
    embedding: EmbeddingCache,
    vector: VectorStore,
    cache: CacheClient,
    item: dict[str, Any],
    full: bool,
    index_readme_docs: bool = True,
    index_manifest: bool = False,
    manifest_key: str = "",
) -> str:
    repo_id = int(item["repoId"])
    full_name = str(item["fullName"])
    repo = _repo_payload(item)
    changed = False

    if index_readme_docs:
        etag = None if full else item.get("readmeEtag")
        readme = await fetcher.fetch_readme(full_name, etag=etag)
        if readme is None:
            await vector.delete_repo(repo_id, chunk_type="readme")
            logger.info("readme_missing", repo=full_name)
        elif readme.unchanged:
            logger.info("readme_unchanged", repo=full_name)
        elif not readme.content:
            await vector.delete_repo(repo_id, chunk_type="readme")
            await backend.upsert_repo_document(
                repo_id=repo_id,
                kind="readme",
                source_url=readme.source_url,
                sha=readme.sha,
                etag=readme.etag,
                content="",
                token_count=0,
            )
        else:
            await backend.upsert_repo_document(
                repo_id=repo_id,
                kind="readme",
                source_url=readme.source_url,
                sha=readme.sha,
                etag=readme.etag,
                content=readme.content,
                token_count=readme.token_count,
            )
            await index_readme(
                settings,
                vector,
                embedding,
                repo=repo,
                content=readme.content,
                sha=readme.sha,
                source_url=readme.source_url,
            )
            changed = True

    if index_manifest:
        manifest = await fetcher.fetch_manifest(full_name, language=item.get("language"))
        if manifest is not None:
            await backend.upsert_repo_document(
                repo_id=repo_id,
                kind="manifest",
                source_url=manifest.source_url,
                sha=manifest.sha,
                etag=None,
                content=manifest.content,
                token_count=manifest.token_count,
            )
            await index_readme(
                settings,
                vector,
                embedding,
                repo=repo,
                content=manifest.content,
                sha=manifest.sha,
                source_url=manifest.source_url,
                chunk_type="manifest",
            )
            changed = True
            logger.info("manifest_indexed", repo=full_name, path=manifest.path)
        else:
            await vector.delete_repo(repo_id, chunk_type="manifest")
            logger.info("manifest_missing", repo=full_name)
        if manifest_key:
            # 标记已处理（含「确实没有 manifest」），避免每轮重复消耗 GitHub 额度。
            await cache.set_text(manifest_key, "1", MANIFEST_MARKER_TTL_SECONDS)

    return "indexed" if changed else "skipped"


def _manifest_key(settings: Settings, item: dict[str, Any]) -> str:
    # 按集合隔离：新集合首次全量重建时重新抓取 manifest，保证证据完整
    return (
        f"index:manifest:{settings.qdrant_collection}:"
        f"{item.get('repoId')}:{item.get('pushedAt') or 'unknown'}"
    )


def _repo_payload(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "repoId": item.get("repoId"),
        "fullName": item.get("fullName"),
        "pushedAt": item.get("pushedAt"),
        "language": item.get("language"),
        "category": item.get("category"),
        "license": item.get("license"),
        "platform": item.get("platform"),
        "stars": item.get("stars"),
    }
