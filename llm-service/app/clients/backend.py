from __future__ import annotations

from typing import Any

import httpx
import structlog

from app.core.config import Settings

logger = structlog.get_logger("backend")


class BackendError(RuntimeError):
    """backend 内部接口调用失败。"""

    def __init__(
        self, message: str, *, status: int | None = None, code: str = "backend_error"
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class QuotaExceededError(BackendError):
    def __init__(
        self,
        message: str,
        *,
        used: int | None = None,
        limit: int | None = None,
        reset_at: str | None = None,
    ) -> None:
        super().__init__(message, status=429, code="quota_exceeded")
        self.used = used
        self.limit = limit
        self.reset_at = reset_at


class BackendClient:
    """仓库检索、配额与会话落库的唯一出口。

    llm-service 不直连 MySQL，所有业务数据都通过 backend 内部接口获取。
    """

    def __init__(self, settings: Settings) -> None:
        self._base_url = f"{settings.backend_url.rstrip('/')}/api"
        self._internal_token = settings.internal_token
        self._timeout = settings.backend_timeout_seconds

    def _headers(self) -> dict[str, str]:
        return {"X-Internal-Token": self._internal_token}

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> Any:
        url = f"{self._base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.request(
                    method,
                    url,
                    params=_clean_params(params),
                    json=json_body,
                    headers=self._headers(),
                )
        except httpx.HTTPError as exc:
            raise BackendError(f"backend 请求失败：{exc}") from exc

        if response.status_code == 429:
            body = _json_or_empty(response)
            raise QuotaExceededError(
                str(body.get("message") or "今日配额已用完"),
                used=body.get("used"),
                limit=body.get("limit"),
                reset_at=body.get("resetAt"),
            )

        if response.status_code >= 400:
            body = _json_or_empty(response)
            raise BackendError(
                str(body.get("message") or f"backend 返回 {response.status_code}"),
                status=response.status_code,
                code=str(body.get("code") or "backend_error"),
            )

        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    async def reserve_chat_quota(self, user_id: int) -> dict[str, Any]:
        return await self._request(
            "POST",
            "/internal/quota/reserve",
            json_body={"userId": user_id, "kind": "chat"},
        )

    async def reserve_compare_quota(self, user_id: int) -> dict[str, Any]:
        return await self._request(
            "POST",
            "/internal/quota/reserve",
            json_body={"userId": user_id, "kind": "compare"},
        )

    async def create_comparison(
        self,
        *,
        user_id: int,
        idea_id: int | None,
        repo_keys: list[str],
        schema_version: str,
        result: dict[str, Any],
        cache_key: str,
    ) -> int:
        body = await self._request(
            "POST",
            "/internal/comparisons",
            json_body={
                "userId": user_id,
                "ideaId": idea_id,
                "repoKeys": repo_keys,
                "schemaVersion": schema_version,
                "result": result,
                "cacheKey": cache_key,
            },
        )
        return int(body["id"])

    async def search_repos(
        self,
        *,
        q: str | None = None,
        language: str | None = None,
        category: str | None = None,
        license: str | None = None,
        platform: str | None = None,
        min_stars: int | None = None,
        sort: str = "stars",
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        return await self._request(
            "GET",
            "/internal/repos/search",
            params={
                "q": q,
                "language": language,
                "category": category,
                "license": license,
                "platform": platform,
                "minStars": min_stars,
                "sort": sort,
                "limit": limit,
            },
        )

    async def get_repos_batch(self, full_names: list[str]) -> list[dict[str, Any]]:
        return await self._request(
            "POST",
            "/internal/repos/batch",
            json_body={"fullNames": full_names},
        )

    async def list_index_repos(
        self, *, cursor: int | None = None, limit: int = 100
    ) -> dict[str, Any]:
        return await self._request(
            "GET",
            "/internal/index/repos",
            params={"cursor": cursor, "limit": limit},
        )

    async def upsert_repo_document(
        self,
        *,
        repo_id: int,
        kind: str,
        source_url: str | None,
        sha: str | None,
        etag: str | None,
        content: str,
        token_count: int,
    ) -> int:
        body = await self._request(
            "POST",
            "/internal/repo-documents",
            json_body={
                "repoId": repo_id,
                "kind": kind,
                "sourceUrl": source_url,
                "sha": sha,
                "etag": etag,
                "content": content,
                "tokenCount": token_count,
            },
        )
        return int(body["id"])

    async def mark_indexed(self, repo_ids: list[int]) -> None:
        if not repo_ids:
            return
        await self._request("POST", "/internal/index/mark", json_body={"repoIds": repo_ids})

    async def create_idea(
        self,
        *,
        user_id: int,
        raw_text: str,
        structured: dict[str, Any],
        title: str | None = None,
    ) -> int:
        body = await self._request(
            "POST",
            "/internal/ideas",
            json_body={
                "userId": user_id,
                "rawText": raw_text,
                "structured": structured,
                "title": title,
            },
        )
        return int(body["id"])

    async def get_idea(self, idea_id: int, *, user_id: int) -> dict[str, Any]:
        return await self._request(
            "GET",
            f"/internal/ideas/{idea_id}",
            params={"userId": user_id},
        )

    async def update_idea(self, idea_id: int, structured: dict[str, Any]) -> dict[str, Any]:
        return await self._request(
            "PATCH",
            f"/internal/ideas/{idea_id}",
            json_body={"structured": structured},
        )

    async def get_repo(self, full_name: str) -> dict[str, Any]:
        return await self._request("GET", f"/internal/repos/{full_name}")

    async def get_rank(
        self,
        *,
        rank_type: str = "total",
        language: str | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        return await self._request(
            "GET",
            "/internal/repos/rank",
            params={"type": rank_type, "language": language, "limit": limit},
        )

    async def create_conversation(
        self,
        *,
        user_id: int,
        mode: str = "chat",
        idea_id: int | None = None,
        title: str | None = None,
    ) -> int:
        body = await self._request(
            "POST",
            "/internal/conversations",
            json_body={"userId": user_id, "mode": mode, "ideaId": idea_id, "title": title},
        )
        return int(body["id"])

    async def append_message(
        self,
        *,
        conversation_id: int,
        role: str,
        content: str,
        tool_trace: list[dict[str, Any]] | None = None,
        refs: list[dict[str, Any]] | None = None,
        tokens_in: int | None = None,
        tokens_out: int | None = None,
    ) -> int:
        body = await self._request(
            "POST",
            "/internal/messages",
            json_body={
                "conversationId": conversation_id,
                "role": role,
                "content": content,
                "toolTrace": tool_trace or [],
                "refs": refs or [],
                "tokensIn": tokens_in,
                "tokensOut": tokens_out,
            },
        )
        return int(body["id"])


def _clean_params(params: dict[str, Any] | None) -> dict[str, Any] | None:
    if params is None:
        return None
    return {key: value for key, value in params.items() if value is not None and value != ""}


def _json_or_empty(response: httpx.Response) -> dict[str, Any]:
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}
