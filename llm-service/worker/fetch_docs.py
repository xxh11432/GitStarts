"""GitHub README 抓取：条件请求（ETag）、退避重试、HTML/脚本清洗。"""

from __future__ import annotations

import asyncio
import base64
import html
import re
from dataclasses import dataclass

import httpx
import structlog

from app.core.config import Settings
from worker.chunk import estimate_tokens

logger = structlog.get_logger("fetch_docs")

MAX_CONTENT_CHARS = 1_800_000
MAX_MANIFEST_CHARS = 60_000

# 按语言挑 1–2 个关键 manifest，避免对每个仓库盲试所有路径浪费 GitHub 额度。
MANIFEST_CANDIDATES: dict[str, tuple[str, ...]] = {
    "JavaScript": ("package.json",),
    "TypeScript": ("package.json",),
    "Python": ("pyproject.toml", "requirements.txt"),
    "Java": ("pom.xml", "build.gradle"),
    "Kotlin": ("build.gradle.kts", "pom.xml"),
    "Rust": ("Cargo.toml",),
    "Go": ("go.mod",),
    "PHP": ("composer.json",),
    "Ruby": ("Gemfile",),
    "C#": ("*.csproj",),
    "C++": ("CMakeLists.txt",),
    "C": ("Makefile",),
}
DEFAULT_MANIFESTS: tuple[str, ...] = ("Dockerfile", "docker-compose.yml")
_SCRIPT = re.compile(r"<script\b[^>]*>.*?</script>", re.IGNORECASE | re.DOTALL)
_STYLE = re.compile(r"<style\b[^>]*>.*?</style>", re.IGNORECASE | re.DOTALL)
_IFRAME = re.compile(r"<iframe\b[^>]*>.*?</iframe>", re.IGNORECASE | re.DOTALL)
_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_BREAK = re.compile(r"<(br|hr)\s*/?>", re.IGNORECASE)
_TAG = re.compile(r"</?[a-zA-Z][^>]*>")
_LINK = re.compile(r"\[([^\]]*)\]\((?:javascript|data):[^)]*\)", re.IGNORECASE)
_BLANK_LINES = re.compile(r"\n{3,}")


class GithubFetchError(RuntimeError):
    """README 拉取失败（非 404）。"""


@dataclass(frozen=True)
class FetchedReadme:
    content: str
    sha: str | None
    etag: str | None
    source_url: str | None
    token_count: int
    unchanged: bool = False


@dataclass(frozen=True)
class FetchedManifest:
    path: str
    content: str
    sha: str | None
    source_url: str | None
    token_count: int


def clean_markdown(raw: str) -> str:
    """README 视为不可信文本：去掉脚本/样式/iframe/注释与残留 HTML 标签。"""
    text = raw.replace("\r\n", "\n")
    text = _COMMENT.sub("", text)
    text = _SCRIPT.sub("", text)
    text = _STYLE.sub("", text)
    text = _IFRAME.sub("", text)
    text = _BREAK.sub("\n", text)
    text = _TAG.sub("", text)
    text = _LINK.sub(r"\1", text)
    text = html.unescape(text)
    text = text.replace("\u00a0", " ")
    text = _BLANK_LINES.sub("\n\n", text)
    return text.strip()


class ReadmeFetcher:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: httpx.AsyncClient | None = None

    def _connect(self) -> httpx.AsyncClient:
        if self._client is None:
            headers = {
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "gitstars-ingest-worker",
            }
            if self._settings.github_token:
                headers["Authorization"] = f"Bearer {self._settings.github_token}"
            self._client = httpx.AsyncClient(
                base_url=self._settings.github_api_base.rstrip("/"),
                headers=headers,
                timeout=self._settings.github_timeout_seconds,
            )
        return self._client

    async def fetch_readme(
        self, full_name: str, *, etag: str | None = None
    ) -> FetchedReadme | None:
        """返回 None 表示仓库没有 README（404）；unchanged=True 表示 304。"""
        client = self._connect()
        headers = {"If-None-Match": etag} if etag else {}
        url = f"/repos/{full_name}/readme"

        last_error: Exception | None = None
        for attempt in range(max(1, self._settings.github_max_retries)):
            try:
                response = await client.get(url, headers=headers)
            except httpx.HTTPError as exc:
                last_error = exc
                await self._sleep(attempt, None)
                continue

            if response.status_code == 304:
                return FetchedReadme("", None, etag, None, 0, unchanged=True)
            if response.status_code in (404, 451):
                return None
            if response.status_code == 401:
                raise GithubFetchError("GitHub Token 无效或权限不足")
            if response.status_code in (403, 429) or response.status_code >= 500:
                last_error = GithubFetchError(f"GitHub 返回 {response.status_code}")
                await self._sleep(attempt, response)
                continue
            if response.status_code >= 400:
                last_error = GithubFetchError(f"GitHub 返回 {response.status_code}")
                await self._sleep(attempt, None)
                continue

            return self._parse(response)

        raise GithubFetchError(f"README 拉取失败：{full_name}（{last_error}）")

    async def fetch_manifest(
        self, full_name: str, *, language: str | None
    ) -> FetchedManifest | None:
        """抓取一个关键 manifest（依赖/部署信息）；没有则返回 None。"""
        client = self._connect()
        for path in manifest_paths(language):
            try:
                response = await client.get(f"/repos/{full_name}/contents/{path}")
            except httpx.HTTPError as exc:
                logger.warning(
                    "manifest_fetch_failed", repo=full_name, path=path, error=type(exc).__name__
                )
                continue
            if response.status_code in (404, 451):
                continue
            if response.status_code == 403 or response.status_code == 429:
                logger.warning("manifest_rate_limited", repo=full_name, status=response.status_code)
                return None
            if response.status_code >= 400:
                logger.warning(
                    "manifest_fetch_failed", repo=full_name, path=path, status=response.status_code
                )
                continue
            body = response.json()
            if isinstance(body, list):  # 目录：跳过
                continue
            raw = body.get("content") if isinstance(body, dict) else None
            if not isinstance(raw, str) or not raw:
                continue
            try:
                text = base64.b64decode(raw).decode("utf-8", errors="ignore")
            except (ValueError, UnicodeDecodeError):
                continue
            text = clean_markdown(text)[:MAX_MANIFEST_CHARS]
            if not text:
                continue
            content = f"# {path}\n{text}"
            return FetchedManifest(
                path=path,
                content=content,
                sha=str(body.get("sha") or "") or None,
                source_url=str(body.get("html_url") or "") or None,
                token_count=estimate_tokens(content),
            )
        return None

    def _parse(self, response: httpx.Response) -> FetchedReadme:
        body = response.json()
        content = ""
        if isinstance(body, dict):
            raw = body.get("content")
            encoding = body.get("encoding")
            if isinstance(raw, str) and raw:
                try:
                    text = base64.b64decode(raw) if encoding == "base64" else raw
                    content = text.decode("utf-8", errors="ignore")
                except (ValueError, UnicodeDecodeError):
                    content = ""
        content = clean_markdown(content)[:MAX_CONTENT_CHARS]
        return FetchedReadme(
            content=content,
            sha=str(body.get("sha") or "") or None if isinstance(body, dict) else None,
            etag=response.headers.get("etag"),
            source_url=str(body.get("html_url") or "") or None if isinstance(body, dict) else None,
            token_count=estimate_tokens(content),
        )

    async def _sleep(self, attempt: int, response: httpx.Response | None) -> None:
        delay = self._settings.github_backoff_seconds * (2**attempt)
        if response is not None:
            retry_after = response.headers.get("retry-after")
            if retry_after and retry_after.isdigit():
                delay = max(delay, float(retry_after))
        logger.warning("github_backoff", attempt=attempt, delay=round(delay, 2))
        await asyncio.sleep(min(delay, 30.0))

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None


def manifest_paths(language: str | None) -> tuple[str, ...]:
    if not language:
        return DEFAULT_MANIFESTS
    return MANIFEST_CANDIDATES.get(language, DEFAULT_MANIFESTS)
