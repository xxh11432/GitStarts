from __future__ import annotations

import asyncio
import os
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import httpx
import structlog

from app.core.config import Settings

logger = structlog.get_logger("embedding")

_PASSAGE_PREFIX = "passage: "
_QUERY_PREFIX = "query: "


@contextmanager
def _model_init_lock(cache_dir: str | None) -> Iterator[None]:
    """跨进程文件锁：llm-service 与 ingest-worker 首次启动时只允许一个进程下载/初始化模型。"""
    if not cache_dir:
        yield
        return
    try:
        os.makedirs(cache_dir, exist_ok=True)
        import fcntl
    except (OSError, ImportError):
        # 本地 Windows 开发没有 fcntl，退化为无锁
        yield
        return
    lock_path = os.path.join(cache_dir, ".fastembed-init.lock")
    try:
        handle = os.open(lock_path, os.O_CREAT | os.O_WRONLY, 0o600)
    except OSError:
        yield
        return
    try:
        fcntl.flock(handle, fcntl.LOCK_EX)
        yield
    finally:
        try:
            fcntl.flock(handle, fcntl.LOCK_UN)
        finally:
            os.close(handle)


class EmbeddingError(RuntimeError):
    """Embedding 生成失败。"""


class EmbeddingService:
    """本地 fastembed 或供应商 API 的统一入口。

    fastembed 的 e5 系列模型要求 passage/query 前缀；其他模型不加前缀。
    实例通过 get_embedding_service 进程内复用，避免每个请求都重新加载 ONNX 模型。
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._model: Any = None
        self._is_e5 = "e5" in settings.llm_embedding_model.lower()
        # fastembed 的模型对象不是线程安全的：to_thread 并发调用时串行化
        self._embed_lock = threading.Lock()

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

        cache_dir = self._settings.fastembed_cache or None
        with self._embed_lock:
            if self._model is None:
                # 首次初始化可能触发模型下载；用文件锁避免 llm-service / worker 并发下载
                with _model_init_lock(cache_dir):
                    if self._model is None:
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
        # embedding 使用独立配置（如硅基流动），缺省时才回落到对话供应商
        base_url = (self._settings.embedding_base_url or self._settings.llm_base_url).rstrip("/")
        api_key = self._settings.embedding_api_key or self._settings.llm_api_key
        if not api_key:
            raise EmbeddingError("EMBEDDING_PROVIDER=api 但缺少 EMBEDDING_API_KEY")

        url = f"{base_url}/embeddings"
        headers = {"Authorization": f"Bearer {api_key}"}
        vectors: list[list[float]] = []
        batch = max(1, self._settings.embedding_batch_size)
        async with httpx.AsyncClient(timeout=self._settings.request_timeout_seconds) as client:
            for start in range(0, len(texts), batch):
                chunk = texts[start : start + batch]
                response = None
                # 供应商限流/抖动时短暂退避重试，避免整批索引因单次 429 失败
                for attempt in range(3):
                    response = await client.post(
                        url,
                        headers=headers,
                        json={"model": self._settings.llm_embedding_model, "input": chunk},
                    )
                    if response.status_code not in (429, 500, 502, 503, 504):
                        break
                    if attempt < 2:
                        await asyncio.sleep(float(attempt + 1))
                if response is None or response.status_code >= 400:
                    status = response.status_code if response is not None else "unknown"
                    raise EmbeddingError(f"embedding 接口返回 {status}")
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


_services: dict[tuple[str, str, int, str], EmbeddingService] = {}
_services_lock = threading.Lock()


def get_embedding_service(settings: Settings) -> EmbeddingService:
    """进程内共享模型实例：启动预热与请求处理使用同一个 ONNX 会话。"""
    key = (
        settings.embedding_provider,
        settings.llm_embedding_model,
        settings.llm_embedding_dim,
        settings.fastembed_cache or "",
    )
    with _services_lock:
        service = _services.get(key)
        if service is None:
            service = EmbeddingService(settings)
            _services[key] = service
        return service
