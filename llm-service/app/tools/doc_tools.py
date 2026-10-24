"""对比与深读的证据检索：只从仓库自己的 README / manifest 分块里取片段。

每个证据都带 source_url，前端可以逐格回溯源文；拿不到证据时由上层写「信息不足」。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import structlog

from app.clients.vector import VectorHit, VectorStore, build_filter
from app.core.config import Settings
from app.schemas.compare import DIMENSION_KEYS, DIMENSION_QUERIES
from app.services.embedding import EmbeddingService

logger = structlog.get_logger("doc_tools")

SNIPPET_LIMIT = 360


@dataclass(frozen=True)
class EvidenceHit:
    section: str
    snippet: str
    source_url: str | None
    chunk_type: str
    score: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "section": self.section,
            "snippet": self.snippet,
            "sourceUrl": self.source_url,
            "chunkType": self.chunk_type,
        }


def to_evidence(hit: VectorHit, *, limit: int = SNIPPET_LIMIT) -> EvidenceHit:
    return EvidenceHit(
        section=hit.section or ("manifest" if hit.chunk_type == "manifest" else "README"),
        snippet=hit.content[:limit],
        source_url=hit.source_url or None,
        chunk_type=hit.chunk_type,
        score=round(hit.score, 4),
    )


class DocToolExecutor:
    """search_repo_docs 的实现：Qdrant payload 过滤 + 段落重排。"""

    def __init__(
        self,
        *,
        settings: Settings,
        vector: VectorStore,
        embedding: EmbeddingService,
    ) -> None:
        self._settings = settings
        self._vector = vector
        self._embedding = embedding

    async def search_repo_docs(
        self,
        *,
        repo_id: int,
        query: str,
        top_k: int = 6,
        chunk_types: list[str] | None = None,
    ) -> list[EvidenceHit]:
        if not repo_id or not query.strip():
            return []
        limit = max(1, min(top_k, 12))
        try:
            vector = await self._embedding.embed_query(query)
            hits = await self._vector.search(
                vector,
                limit=limit,
                query_filter=build_filter(
                    repo_id=repo_id,
                    chunk_types=chunk_types or ["readme", "manifest"],
                ),
            )
        except Exception as exc:
            logger.warning("repo_doc_search_failed", repo_id=repo_id, error=type(exc).__name__)
            return []
        return dedupe([to_evidence(hit) for hit in hits])[:limit]

    async def collect_dimension_evidence(
        self,
        *,
        repo_id: int,
        goal: str,
        top_k: int | None = None,
    ) -> dict[str, list[EvidenceHit]]:
        """按固定维度批量召回证据：一次 embedding、并发检索。"""
        if not repo_id:
            return {key: [] for key in DIMENSION_KEYS}
        limit = top_k or self._settings.compare_evidence_topk
        queries = [f"{goal} {DIMENSION_QUERIES[key]}".strip() for key in DIMENSION_KEYS]
        try:
            vectors = await self._embedding.embed_queries(queries)
        except Exception as exc:
            logger.warning("dimension_embed_failed", repo_id=repo_id, error=type(exc).__name__)
            return {key: [] for key in DIMENSION_KEYS}

        async def one(key: str, vector: list[float]) -> tuple[str, list[EvidenceHit]]:
            try:
                hits = await self._vector.search(
                    vector,
                    limit=max(1, limit),
                    query_filter=build_filter(repo_id=repo_id, chunk_types=["readme", "manifest"]),
                )
            except Exception as exc:
                logger.warning(
                    "dimension_search_failed",
                    repo_id=repo_id,
                    dimension=key,
                    error=type(exc).__name__,
                )
                return key, []
            return key, dedupe([to_evidence(hit) for hit in hits])

        pairs = await asyncio.gather(
            *(one(key, vector) for key, vector in zip(DIMENSION_KEYS, vectors, strict=False))
        )
        return {key: hits for key, hits in pairs}

    async def collect_overview_evidence(
        self, *, repo_id: int, goal: str, description: str, top_k: int = 4
    ) -> list[EvidenceHit]:
        query = f"{goal} {description} 项目介绍 架构 overview architecture".strip()
        return await self.search_repo_docs(repo_id=repo_id, query=query, top_k=top_k)

    async def close(self) -> None:
        await self._vector.close()


def dedupe(hits: list[EvidenceHit]) -> list[EvidenceHit]:
    seen: set[str] = set()
    result: list[EvidenceHit] = []
    for hit in hits:
        fingerprint = f"{hit.chunk_type}:{hit.section}:{hit.snippet[:80]}"
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        result.append(hit)
    return result


def match_evidence(
    cells: list[Any], evidence: dict[str, list[EvidenceHit]]
) -> dict[str, list[EvidenceHit]]:
    """把模型引用的 section 映射回真实证据；找不到引用时退回该维度前两条。"""
    matched: dict[str, list[EvidenceHit]] = {}
    for cell in cells:
        key = str(getattr(cell, "key", ""))
        if key not in evidence:
            continue
        sections = {str(section).strip().lower() for section in cell.evidence_sections}
        picked = (
            [hit for hit in evidence[key] if hit.section.strip().lower() in sections]
            if sections
            else []
        )
        matched[key] = (picked or evidence[key])[:2]
    return matched
