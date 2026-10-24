"""Qdrant 写入：幂等 upsert，README 变更时先清理旧分块。"""

from __future__ import annotations

from typing import Any

import structlog

from app.clients.vector import ChunkPoint, VectorStore
from app.core.config import Settings
from worker.chunk import Chunk, chunk_markdown
from worker.embed import EmbeddingCache

logger = structlog.get_logger("index")


def build_payload(
    repo: dict[str, Any],
    sha: str | None,
    source_url: str | None,
    *,
    chunk_type: str = "readme",
) -> dict[str, Any]:
    return {
        "repo_id": int(repo.get("repoId") or repo.get("id") or 0),
        "full_name": repo.get("fullName"),
        "chunk_type": chunk_type,
        "source_url": source_url,
        "sha": sha,
        "pushed_at": repo.get("pushedAt"),
        "language": repo.get("language"),
        "category": repo.get("category"),
        "license": repo.get("license"),
        "platform": repo.get("platform"),
        "stars": repo.get("stars"),
    }


def build_points(
    *,
    repo: dict[str, Any],
    chunks: list[Chunk],
    vectors: dict[str, list[float]],
    sha: str | None,
    source_url: str | None,
    chunk_type: str = "readme",
) -> list[ChunkPoint]:
    payload = build_payload(repo, sha, source_url, chunk_type=chunk_type)
    points: list[ChunkPoint] = []
    for chunk in chunks:
        vector = vectors.get(chunk.chunk_hash)
        if not vector:
            continue
        points.append(
            ChunkPoint(
                repo_id=int(payload["repo_id"]),
                full_name=str(payload.get("full_name") or ""),
                section=chunk.section,
                content=chunk.content,
                chunk_hash=chunk.chunk_hash,
                source_url=source_url or "",
                sha=sha or "",
                vector=vector,
                payload={
                    **payload,
                    "section": chunk.section,
                    "content": chunk.content,
                    "chunk_hash": chunk.chunk_hash,
                },
            )
        )
    return points


async def index_readme(
    settings: Settings,
    vector_store: VectorStore,
    embedding_cache: EmbeddingCache,
    *,
    repo: dict[str, Any],
    content: str,
    sha: str | None,
    source_url: str | None,
    chunk_type: str = "readme",
) -> int:
    repo_id = int(repo.get("repoId") or repo.get("id") or 0)
    if not repo_id:
        raise ValueError("仓库缺少 repoId")

    chunks = chunk_markdown(
        content,
        target_tokens=settings.index_chunk_target_tokens,
        min_tokens=settings.index_chunk_min_tokens,
        max_tokens=settings.index_chunk_max_tokens,
        overlap_tokens=settings.index_chunk_overlap_tokens,
    )
    await vector_store.delete_repo(repo_id, chunk_type=chunk_type)
    if not chunks:
        logger.info(
            "document_empty",
            repo=repo.get("fullName"),
            repo_id=repo_id,
            chunk_type=chunk_type,
        )
        return 0

    vectors = await embedding_cache.embed(chunks)
    points = build_points(
        repo=repo,
        chunks=chunks,
        vectors=vectors,
        sha=sha,
        source_url=source_url,
        chunk_type=chunk_type,
    )
    count = await vector_store.upsert_chunks(points)
    logger.info(
        "repo_indexed",
        repo=repo.get("fullName"),
        chunks=len(chunks),
        points=count,
        chunk_type=chunk_type,
    )
    return count
