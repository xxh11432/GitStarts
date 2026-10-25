"""Chunk embedding：按 hash 去重，批量编码，避免重复计算。"""

from __future__ import annotations

from collections import OrderedDict

import structlog

from app.services.embedding import EmbeddingService
from worker.chunk import Chunk

logger = structlog.get_logger("embed")

# 1024 维向量以 Python float 列表缓存约 32 MB 上限；增量轮次重复内容很少，
# 把上限从 8192 收紧，避免全量重建时 worker 常驻内存持续上涨。
_MAX_CACHE = 1024


class EmbeddingCache:
    def __init__(self, service: EmbeddingService, *, max_items: int = _MAX_CACHE) -> None:
        self._service = service
        self._cache: OrderedDict[str, list[float]] = OrderedDict()
        self._max_items = max_items

    async def embed(self, chunks: list[Chunk]) -> dict[str, list[float]]:
        """返回 chunk_hash → 向量；同一 hash 只编码一次。"""
        pending: dict[str, str] = {}
        result: dict[str, list[float]] = {}
        for chunk in chunks:
            if chunk.chunk_hash in self._cache:
                self._cache.move_to_end(chunk.chunk_hash)
                result[chunk.chunk_hash] = self._cache[chunk.chunk_hash]
            else:
                pending.setdefault(chunk.chunk_hash, chunk.content)

        if pending:
            hashes = list(pending)
            vectors = await self._service.embed_documents([pending[key] for key in hashes])
            for key, vector in zip(hashes, vectors, strict=True):
                result[key] = vector
                self._cache[key] = vector
                self._cache.move_to_end(key)
            while len(self._cache) > self._max_items:
                self._cache.popitem(last=False)

            logger.info("chunks_embedded", unique=len(hashes), total=len(chunks))
        return result

    def clear(self) -> None:
        self._cache.clear()
