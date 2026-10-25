from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

import structlog
from qdrant_client import AsyncQdrantClient, models

from app.core.config import Settings

logger = structlog.get_logger("vector")

_NAMESPACE = uuid.UUID("2c47b0fa-5cb1-4e0a-9d63-0f1f2f0f6a11")

PAYLOAD_INDEXES: dict[str, models.PayloadSchemaType] = {
    "repo_id": models.PayloadSchemaType.INTEGER,
    "language": models.PayloadSchemaType.KEYWORD,
    "category": models.PayloadSchemaType.KEYWORD,
    "license": models.PayloadSchemaType.KEYWORD,
    "platform": models.PayloadSchemaType.KEYWORD,
    "full_name": models.PayloadSchemaType.KEYWORD,
    "chunk_type": models.PayloadSchemaType.KEYWORD,
    "stars": models.PayloadSchemaType.INTEGER,
}


@dataclass(frozen=True)
class ChunkPoint:
    repo_id: int
    full_name: str
    section: str
    content: str
    chunk_hash: str
    source_url: str
    sha: str
    vector: list[float]
    payload: dict[str, Any]

    @property
    def point_id(self) -> str:
        return str(uuid.uuid5(_NAMESPACE, f"{self.full_name}:{self.chunk_hash}"))


@dataclass(frozen=True)
class VectorHit:
    repo_id: int
    full_name: str
    score: float
    section: str
    content: str
    source_url: str
    chunk_type: str = "readme"


def build_filter(
    *,
    languages: list[str] | None = None,
    licenses: list[str] | None = None,
    category: str | None = None,
    platforms: list[str] | None = None,
    min_stars: int | None = None,
    repo_id: int | None = None,
    chunk_types: list[str] | None = None,
) -> models.Filter | None:
    must: list[models.Condition] = []
    if languages:
        must.append(_match_any("language", _case_variants(languages)))
    if platforms:
        must.append(_match_any("platform", _case_variants(platforms)))
    if category:
        must.append(models.FieldCondition(key="category", match=models.MatchValue(value=category)))
    if licenses:
        must.append(
            models.FieldCondition(
                key="license", match=models.MatchAny(any=_case_variants(licenses))
            )
        )
    if min_stars:
        must.append(models.FieldCondition(key="stars", range=models.Range(gte=min_stars)))
    if repo_id:
        must.append(models.FieldCondition(key="repo_id", match=models.MatchValue(value=repo_id)))
    if chunk_types:
        must.append(_match_any("chunk_type", chunk_types))
    return models.Filter(must=must) if must else None


def _match_any(key: str, values: list[str]) -> models.FieldCondition:
    if len(values) == 1:
        return models.FieldCondition(key=key, match=models.MatchValue(value=values[0]))
    return models.FieldCondition(key=key, match=models.MatchAny(any=values))


def _case_variants(values: list[str]) -> list[str]:
    """Qdrant keyword 匹配大小写敏感；同时尝试常见写法，避免 Python/python、MIT/mit 漏召。"""
    expanded: list[str] = []
    for value in values:
        for variant in (value, value.lower(), value.upper(), value.title()):
            if variant and variant not in expanded:
                expanded.append(variant)
    return expanded


class VectorStore:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: AsyncQdrantClient | None = None

    @property
    def collection(self) -> str:
        return self._settings.qdrant_collection

    def _connect(self) -> AsyncQdrantClient:
        if self._client is None:
            self._client = AsyncQdrantClient(
                url=self._settings.qdrant_url,
                api_key=self._settings.qdrant_api_key or None,
                timeout=self._settings.github_timeout_seconds,
            )
        return self._client

    async def ensure_collection(self) -> bool:
        """幂等创建集合与 payload 索引；返回是否新建。"""
        client = self._connect()
        created = False
        exists = await client.collection_exists(self.collection)
        if not exists:
            await client.create_collection(
                collection_name=self.collection,
                vectors_config=models.VectorParams(
                    size=self._settings.llm_embedding_dim,
                    distance=models.Distance.COSINE,
                    # 低内存部署：向量落盘（mmap），避免集合常驻内存随规模增长
                    on_disk=self._settings.qdrant_on_disk,
                ),
                hnsw_config=models.HnswConfigDiff(on_disk=self._settings.qdrant_on_disk),
            )
            created = True
            logger.info("collection_created", collection=self.collection)

        for field, schema in PAYLOAD_INDEXES.items():
            try:
                await client.create_payload_index(
                    collection_name=self.collection,
                    field_name=field,
                    field_schema=schema,
                )
            except Exception as exc:  # 索引已存在时也走这里，不影响主流程
                logger.debug("payload_index_skipped", field=field, error=type(exc).__name__)
        return created

    async def search(
        self,
        vector: list[float],
        *,
        limit: int,
        query_filter: models.Filter | None = None,
    ) -> list[VectorHit]:
        client = self._connect()
        if not await client.collection_exists(self.collection):
            return []
        response = await client.query_points(
            collection_name=self.collection,
            query=vector,
            limit=max(1, limit),
            query_filter=query_filter,
            with_payload=True,
        )
        hits: list[VectorHit] = []
        for point in response.points:
            payload = point.payload or {}
            hits.append(
                VectorHit(
                    repo_id=int(payload.get("repo_id") or 0),
                    full_name=str(payload.get("full_name") or ""),
                    score=float(point.score),
                    section=str(payload.get("section") or ""),
                    content=str(payload.get("content") or ""),
                    source_url=str(payload.get("source_url") or ""),
                    chunk_type=str(payload.get("chunk_type") or "readme"),
                )
            )
        return hits

    async def upsert_chunks(self, points: list[ChunkPoint]) -> int:
        if not points:
            return 0
        client = self._connect()
        batch = max(1, self._settings.embedding_batch_size * 2)
        for start in range(0, len(points), batch):
            group = points[start : start + batch]
            await client.upsert(
                collection_name=self.collection,
                points=[
                    models.PointStruct(
                        id=point.point_id,
                        vector=point.vector,
                        payload=point.payload,
                    )
                    for point in group
                ],
                wait=False,
            )
        return len(points)

    async def delete_repo(self, repo_id: int, *, chunk_type: str | None = None) -> None:
        client = self._connect()
        conditions: list[models.Condition] = [
            models.FieldCondition(key="repo_id", match=models.MatchValue(value=repo_id))
        ]
        if chunk_type:
            conditions.append(
                models.FieldCondition(key="chunk_type", match=models.MatchValue(value=chunk_type))
            )
        await client.delete(
            collection_name=self.collection,
            points_selector=models.FilterSelector(filter=models.Filter(must=conditions)),
            wait=False,
        )

    async def count(self) -> int:
        client = self._connect()
        if not await client.collection_exists(self.collection):
            return 0
        result = await client.count(collection_name=self.collection, exact=False)
        return int(result.count)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None
