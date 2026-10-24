from __future__ import annotations

import asyncio
from typing import Any

import httpx
import structlog

from app.core.config import Settings

logger = structlog.get_logger("embedding")

_PASSAGE_PREFIX = "passage: "
_QUERY_PREFIX = "query: "


class EmbeddingError(RuntimeError):
    """Embedding 生成失败。"""


class EmbeddingService:
    """本地 fastembed 或供应商 API 的统一入口。

    fastembed 的 e5 系列模型要求 passage/query 前缀；其他模型不加前缀。
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._model: Any = None
        self._is_e5 = "e5" in settings.llm_embedding_model.lower()

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        prepared = [self._passage(text) for text in texts]
        return await self._embed(prepared)

    async def embed_query(self, text: str) -> list[float]:
        vectors = await self._embed([self._query(text)])
        return vectors[0]

    async def embed_queries(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        return await self._embed([self._query(text) for text in texts])

    def _passage(self, text: str) -> str:
        return f"{_PASSAGE_PREFIX}{text}" if self._is_e5 else text

    def _query(self, text: str) -> str:
        return f"{_QUERY_PREFIX}{text}" if self._is_e5 else text

    async def _embed(self, texts: list[str]) -> list[list[float]]:
        if self._settings.embedding_provider == "api":
            return await self._embed_api(texts)
        return await asyncio.to_thread(self._embed_fastembed, texts)

    def _embed_fastembed(self, texts: list[str]) -> list[list[float]]:
        try:
            from fastembed import TextEmbedding
        except ImportError as exc:  # pragma: no cover - 依赖缺失时给出明确错误
            raise EmbeddingError("fastembed 未安装") from exc

        if self._model is None:
            cache_dir = self._settings.fastembed_cache or None
            self._model = TextEmbedding(
                model_name=self._settings.llm_embedding_model,
                cache_dir=cache_dir,
            )

        vectors: list[list[float]] = []
        batch = max(1, self._settings.embedding_batch_size)
        for start in range(0, len(texts), batch):
            chunk = texts[start : start + batch]
            for vector in self._model.embed(chunk):
                values = [float(value) for value in vector]
                if len(values) != self._settings.llm_embedding_dim:
                    raise EmbeddingError(
                        f"embedding 维度不匹配：期望 {self._settings.llm_embedding_dim}，"
                        f"实际 {len(values)}"
                    )
                vectors.append(values)
        return vectors

    async def _embed_api(self, texts: list[str]) -> list[list[float]]:
        if not self._settings.llm_api_key:
            raise EmbeddingError("EMBEDDING_PROVIDER=api 但缺少 LLM_API_KEY")

        url = f"{self._settings.llm_base_url.rstrip('/')}/embeddings"
        headers = {"Authorization": f"Bearer {self._settings.llm_api_key}"}
        vectors: list[list[float]] = []
        batch = max(1, self._settings.embedding_batch_size)
        async with httpx.AsyncClient(timeout=self._settings.request_timeout_seconds) as client:
            for start in range(0, len(texts), batch):
                chunk = texts[start : start + batch]
                response = await client.post(
                    url,
                    headers=headers,
                    json={"model": self._settings.llm_embedding_model, "input": chunk},
                )
                if response.status_code >= 400:
                    raise EmbeddingError(f"embedding 接口返回 {response.status_code}")
                body = response.json()
                data = body.get("data") if isinstance(body, dict) else None
                if not isinstance(data, list):
                    raise EmbeddingError("embedding 接口响应格式异常")
                ordered = sorted(data, key=lambda item: item.get("index", 0))
                for item in ordered:
                    values = [float(value) for value in item.get("embedding", [])]
                    if len(values) != self._settings.llm_embedding_dim:
                        raise EmbeddingError(
                            f"embedding 维度不匹配：期望 {self._settings.llm_embedding_dim}，"
                            f"实际 {len(values)}"
                        )
                    vectors.append(values)
        return vectors
