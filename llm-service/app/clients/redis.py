from __future__ import annotations

import json
from typing import Any

import structlog
from redis.asyncio import Redis

from app.core.config import Settings

logger = structlog.get_logger("redis")


class CacheClient:
    """匹配缓存与索引锁：只有 Redis 可用，业务数据仍由 backend 落 MySQL。"""

    def __init__(self, settings: Settings) -> None:
        self._redis: Redis | None = None
        self._url = settings.checkpoint_redis_url

    def _connect(self) -> Redis:
        if self._redis is None:
            self._redis = Redis.from_url(self._url, decode_responses=True)
        return self._redis

    async def get_json(self, key: str) -> dict[str, Any] | None:
        try:
            raw = await self._connect().get(key)
        except Exception as exc:
            logger.warning("redis_get_failed", key=key, error=type(exc).__name__)
            return None
        if not raw:
            return None
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            return None
        return value if isinstance(value, dict) else None

    async def set_json(self, key: str, value: dict[str, Any], ttl: int) -> None:
        try:
            await self._connect().set(key, json.dumps(value, ensure_ascii=False), ex=max(ttl, 1))
        except Exception as exc:
            logger.warning("redis_set_failed", key=key, error=type(exc).__name__)

    async def get_text(self, key: str) -> str | None:
        try:
            return await self._connect().get(key)
        except Exception as exc:
            logger.warning("redis_get_failed", key=key, error=type(exc).__name__)
            return None

    async def set_text(self, key: str, value: str, ttl: int | None = None) -> None:
        try:
            await self._connect().set(key, value, ex=ttl)
        except Exception as exc:
            logger.warning("redis_set_failed", key=key, error=type(exc).__name__)

    async def acquire_lock(self, key: str, ttl_seconds: int) -> bool:
        try:
            return bool(await self._connect().set(key, "1", nx=True, ex=max(ttl_seconds, 1)))
        except Exception as exc:
            logger.warning("redis_lock_failed", key=key, error=type(exc).__name__)
            return False

    async def delete(self, key: str) -> None:
        try:
            await self._connect().delete(key)
        except Exception as exc:
            logger.warning("redis_delete_failed", key=key, error=type(exc).__name__)

    async def release_lock(self, key: str) -> None:
        await self.delete(key)

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None
