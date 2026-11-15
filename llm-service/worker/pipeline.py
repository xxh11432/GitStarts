"""索引流水线：拉取 → 清洗 → 分块 → embedding → Qdrant，支持断点续跑与 Redis 锁。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import structlog

from app.clients.backend import BackendClient, BackendError
from app.clients.redis import CacheClient
from app.clients.vector import VectorStore
from app.core.config import Settings
from worker.chunk import estimate_tokens
from worker.embed import EmbeddingCache
from worker.fetch_docs import GithubFetchError, ReadmeFetcher
from worker.index import index_readme
from worker.lang_detect import needs_translation
from worker.summarize import RepoSummarizer, SummaryError, build_metadata, fallback_summary
from worker.translate import ReadmeTranslator, TranslationError

logger = structlog.get_logger("pipeline")

CURSOR_KEY = "index:cursor"
FULL_CURSOR_KEY = "index:full_cursor"
LOCK_KEY = "index:lock"
TRANSLATE_LOCK_KEY = "index:translate:lock"
TRANSLATE_LOCK_TTL_SECONDS = 6 * 60 * 60
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


@dataclass
class TranslateStats:
    checked: int = 0
    translated: int = 0
    failed: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "checked": self.checked,
            "translated": self.translated,
            "failed": self.failed,
        }


async def run_index_pass(
    settings: Settings,
    *,
    backend: BackendClient,
    fetcher: ReadmeFetcher,
    embedding: EmbeddingCache,
    vector: VectorStore,
    cache: CacheClient,
    translator: ReadmeTranslator | None = None,
    summarizer: RepoSummarizer | None = None,
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
                # 摘要缺失时即使 README 未变也要补：rerank 文档依赖它
                needs_summary = summarizer is not None and not item.get("repoSummary")
                if not needs_readme and not needs_manifest and not needs_summary:
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
                        translator=translator,
                        summarizer=summarizer,
                        full=full or not item.get("docsIndexedAt"),
                        index_readme_docs=needs_readme,
                        index_manifest=needs_manifest,
                        index_summary=needs_summary or needs_readme,
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
    translator: ReadmeTranslator | None = None,
    summarizer: RepoSummarizer | None = None,
    index_summary: bool = False,
) -> str:
    repo_id = int(item["repoId"])
    full_name = str(item["fullName"])
    repo = _repo_payload(item)
    changed = False
    readme_content = ""
    summary_text = ""

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
                lang=0,
            )
        else:
            # 入库前统一语言治理：非英文（含混排）先翻译成英文，sha 始终保留 GitHub 原始值
            content = readme.content
            lang = 0
            should_translate = (
                translator is not None
                and settings.readme_translate_enabled
                and needs_translation(content)
            )
            if should_translate:
                try:
                    content = await translator.translate(content)
                    lang = 1
                    logger.info(
                        "readme_translated",
                        repo=full_name,
                        source_chars=len(readme.content),
                        chars=len(content),
                    )
                except TranslationError as exc:
                    lang = 2
                    logger.warning(
                        "readme_translate_failed", repo=full_name, detail=str(exc)[:200]
                    )
            await backend.upsert_repo_document(
                repo_id=repo_id,
                kind="readme",
                source_url=readme.source_url,
                sha=readme.sha,
                etag=readme.etag,
                content=content,
                token_count=estimate_tokens(content),
                lang=lang,
            )
            readme_content = content
            changed = True
            # 写文档后立即生成摘要，再进入切块与向量化
            if summarizer is not None and index_summary:
                summary_text = await _refresh_summary(
                    backend=backend,
                    summarizer=summarizer,
                    item=item,
                    repo_id=repo_id,
                    full_name=full_name,
                    readme_content=readme_content,
                )
            await index_readme(
                settings,
                vector,
                embedding,
                repo=repo,
                content=content,
                sha=readme.sha,
                source_url=readme.source_url,
            )

    # 没有新抓到的 README（未变 / 缺失 / 存量回填）时，从文档库取正文补摘要
    if summarizer is not None and index_summary and not readme_content:
        summary_text = await _refresh_summary(
            backend=backend,
            summarizer=summarizer,
            item=item,
            repo_id=repo_id,
            full_name=full_name,
            readme_content=readme_content,
        )
        changed = True

    if summary_text:
        await _index_summary_chunk(
            settings,
            vector,
            embedding,
            repo=repo,
            full_name=full_name,
            summary=summary_text,
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


async def _index_summary_chunk(
    settings: Settings,
    vector: VectorStore,
    embedding: EmbeddingCache,
    *,
    repo: dict[str, Any],
    full_name: str,
    summary: str,
) -> None:
    """把 repoSummary 作为独立 chunk_type 写入 Qdrant，参与产品级语义召回。"""
    await index_readme(
        settings,
        vector,
        embedding,
        repo=repo,
        content=summary,
        sha=None,
        source_url=f"https://github.com/{full_name}",
        chunk_type="repo_summary",
    )
    logger.info("summary_indexed", repo=full_name, chars=len(summary))


async def _refresh_summary(
    *,
    backend: BackendClient,
    summarizer: RepoSummarizer,
    item: dict[str, Any],
    repo_id: int,
    full_name: str,
    readme_content: str,
) -> str | None:
    """README 语言治理后生成 ≤500 字符档案摘要；正文缺失时读文档库回填。"""
    metadata = build_metadata(item)
    if not readme_content:
        # 存量补摘要：README 未重新抓取，直接读文档库里的已翻译正文
        try:
            stored = await backend.get_repo_readme(repo_id)
            readme_content = str(stored.get("content") or "")
        except BackendError as exc:
            logger.warning("summary_readme_fetch_failed", repo=full_name, detail=str(exc)[:200])
    if readme_content:
        try:
            summary = await summarizer.summarize(readme=readme_content, metadata=metadata)
        except SummaryError as exc:
            # 限流或上游异常时不写劣质摘要，留待下一轮重试
            logger.warning("summary_failed", repo=full_name, detail=str(exc)[:200])
            return None
    else:
        # 没有 README 内容时只用事实字段拼摘要，避免模型凭空编造功能
        summary = fallback_summary(metadata)
    await backend.update_repo_summary(repo_id, summary)
    logger.info("summary_updated", repo=full_name, chars=len(summary))
    return summary


async def run_translation_backfill(
    settings: Settings,
    *,
    backend: BackendClient,
    embedding: EmbeddingCache,
    vector: VectorStore,
    cache: CacheClient,
    translator: ReadmeTranslator,
) -> TranslateStats:
    """存量回填：把未检测 / 翻译失败的 README 逐条检测并翻译，成功后重灌该 repo 的向量。"""
    stats = TranslateStats()
    if not settings.readme_translate_enabled:
        return stats
    if not await cache.acquire_lock(TRANSLATE_LOCK_KEY, TRANSLATE_LOCK_TTL_SECONDS):
        logger.warning("translate_locked")
        return stats
    try:
        cursor = 0
        while True:
            page = await backend.list_pending_docs(
                cursor=cursor, limit=settings.readme_translate_page_size
            )
            items = page.get("items") or []
            if not items:
                break
            for item in items:
                try:
                    await _translate_pending_doc(
                        settings,
                        backend=backend,
                        embedding=embedding,
                        vector=vector,
                        translator=translator,
                        item=item,
                        stats=stats,
                    )
                except Exception as exc:  # 单条失败不阻断整轮回填
                    stats.failed += 1
                    logger.warning(
                        "translate_backfill_crashed",
                        repo=item.get("fullName"),
                        error=type(exc).__name__,
                    )
            next_cursor = page.get("nextCursor")
            if next_cursor is None:
                break
            cursor = int(next_cursor)
        logger.info("translate_pass_finished", **stats.as_dict())
        return stats
    finally:
        await cache.release_lock(TRANSLATE_LOCK_KEY)


async def _translate_pending_doc(
    settings: Settings,
    *,
    backend: BackendClient,
    embedding: EmbeddingCache,
    vector: VectorStore,
    translator: ReadmeTranslator,
    item: dict[str, Any],
    stats: TranslateStats,
) -> None:
    repo_id = int(item.get("repoId") or 0)
    full_name = str(item.get("fullName") or "")
    content = str(item.get("content") or "")
    if not repo_id or not full_name or not content:
        return
    source_url = item.get("sourceUrl")
    sha = item.get("sha")
    etag = item.get("etag")

    if not needs_translation(content):
        await backend.upsert_repo_document(
            repo_id=repo_id,
            kind="readme",
            source_url=source_url,
            sha=sha,
            etag=etag,
            content=content,
            token_count=int(item.get("tokenCount") or 0) or estimate_tokens(content),
            lang=0,
        )
        stats.checked += 1
        return

    try:
        translated = await translator.translate(content)
    except TranslationError as exc:
        await backend.upsert_repo_document(
            repo_id=repo_id,
            kind="readme",
            source_url=source_url,
            sha=sha,
            etag=etag,
            content=content,
            token_count=int(item.get("tokenCount") or 0) or estimate_tokens(content),
            lang=2,
        )
        stats.failed += 1
        logger.warning("translate_backfill_failed", repo=full_name, detail=str(exc)[:200])
        return

    # 先重灌向量再回写状态：索引失败时文档仍处于待检测，下轮自动重试
    await index_readme(
        settings,
        vector,
        embedding,
        repo=_pending_repo(item),
        content=translated,
        sha=sha,
        source_url=source_url,
    )
    await backend.upsert_repo_document(
        repo_id=repo_id,
        kind="readme",
        source_url=source_url,
        sha=sha,
        etag=etag,
        content=translated,
        token_count=estimate_tokens(translated),
        lang=1,
    )
    stats.translated += 1
    logger.info("translate_backfill_done", repo=full_name, chars=len(translated))


def _pending_repo(item: dict[str, Any]) -> dict[str, Any]:
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
