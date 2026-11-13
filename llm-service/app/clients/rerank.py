"""Rerank：调用硅基流动 bge-reranker-v2-m3 对候选仓库做交叉编码打分。"""

from __future__ import annotations

import asyncio

import httpx
import structlog

from app.core.config import Settings

logger = structlog.get_logger("rerank")

_RETRY_STATUS = {429, 500, 502, 503, 504}
_QUERY_MAX_CHARS = 300
_DOCUMENT_MAX_CHARS = 800


class RerankError(RuntimeError):
    """Rerank 接口调用失败。"""


class RerankClient:
    """默认复用 embedding 的供应商与 Key，可用 RERANK_* 覆盖。"""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @property
    def enabled(self) -> bool:
        return bool(self._settings.rerank_enabled and self._api_key())

    def _base_url(self) -> str:
        base = (
            self._settings.rerank_base_url
            or self._settings.embedding_base_url
            or self._settings.llm_base_url
        )
        return base.rstrip("/")

    def _api_key(self) -> str:
        return (
            self._settings.rerank_api_key
            or self._settings.embedding_api_key
            or self._settings.llm_api_key
        )

    async def score(self, query: str, documents: list[str]) -> list[float]:
        """返回与 documents 等长的相关度分数（0–1），缺失项按 0 处理。"""
        if not documents:
            return []
        if not self.enabled:
            raise RerankError("rerank 未启用或缺少 API Key")

        batch_size = max(1, self._settings.rerank_batch_size)
        batches: list[tuple[int, list[str]]] = [
            (start, documents[start : start + batch_size])
            for start in range(0, len(documents), batch_size)
        ]
        parts = await asyncio.gather(
            *(self._score_batch(query, start, batch) for start, batch in batches)
        )
        scores = [0.0] * len(documents)
        for (start, _batch), batch_scores in zip(batches, parts, strict=True):
            for offset, value in enumerate(batch_scores):
                scores[start + offset] = value
        return scores

    async def _score_batch(self, query: str, start: int, documents: list[str]) -> list[float]:
        url = f"{self._base_url()}/rerank"
        payload = {
            "model": self._settings.rerank_model,
            "query": query[:_QUERY_MAX_CHARS],
            "documents": [document[:_DOCUMENT_MAX_CHARS] for document in documents],
            "top_n": len(documents),
            "return_documents": False,
        }
        headers = {"Authorization": f"Bearer {self._api_key()}"}

        async with httpx.AsyncClient(timeout=self._settings.rerank_timeout_seconds) as client:
            response = None
            for attempt in range(3):
                try:
                    response = await client.post(url, headers=headers, json=payload)
                except httpx.HTTPError as exc:
                    if attempt >= 2:
                        raise RerankError(f"rerank 请求失败：{type(exc).__name__}") from exc
                    await asyncio.sleep(float(attempt + 1))
                    continue
                if response.status_code not in _RETRY_STATUS:
                    break
                if attempt < 2:
                    await asyncio.sleep(float(attempt + 1))

        if response is None:
            raise RerankError("rerank 无响应")
        if response.status_code >= 400:
            logger.warning("rerank_http_error", status=response.status_code, offset=start)
            raise RerankError(f"rerank 接口返回 {response.status_code}")

        body = response.json()
        results = body.get("results") if isinstance(body, dict) else None
        if not isinstance(results, list):
            raise RerankError("rerank 响应格式异常")

        scores = [0.0] * len(documents)
        for item in results:
            if not isinstance(item, dict):
                continue
            index = item.get("index")
            score = item.get("relevance_score")
            if not isinstance(index, int) or not 0 <= index < len(scores):
                continue
            try:
                scores[index] = float(score or 0.0)
            except (TypeError, ValueError):
                continue
        return scores
