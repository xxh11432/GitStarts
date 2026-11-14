"""仓库档案摘要：融合 README 与仓库元数据，生成 ≤500 字符的英文简介，供 rerank 使用。

README 只描述功能，体量、活跃度、许可证、部署形态等信息在元数据里；摘要把两者合并，
让交叉编码器在打分时同时看到「这个项目做什么」和「这个项目有多大、多活跃」。
"""

from __future__ import annotations

import asyncio
import json

import httpx
import structlog

from app.core.config import Settings

logger = structlog.get_logger("summarize")

SUMMARY_LIMIT = 500
README_INPUT_CHARS = 6000

_SYSTEM_PROMPT = (
    "You are an open-source repository catalogue editor. Write ONE English paragraph "
    "of at most 500 characters describing the repository. Cover, in this order: "
    "1) what it is and the core problem it solves (product form: application, platform, "
    "framework, library, CLI, service); "
    "2) who uses it and the main use cases; "
    "3) technology stack and deployment model (self-hosted, Docker, cloud, desktop, "
    "mobile, browser extension); "
    "4) project scale and activity (stars, forks, last push, latest release); "
    "5) license and commercial-use constraints; "
    "6) ecosystem and integration surface (plugins, APIs, import/export). "
    "Use only the given README and metadata. Write 'unknown' for missing facts; "
    "never invent capabilities. Return plain text only, no markdown, no labels."
)


class SummaryError(RuntimeError):
    """摘要生成失败（配置缺失、上游报错、输出异常）。"""


def build_metadata(item: dict[str, object]) -> dict[str, object]:
    """摘要输入只保留事实字段，不传向量分等检索中间态。"""
    return {
        "fullName": item.get("fullName"),
        "description": item.get("description"),
        "language": item.get("language"),
        "license": item.get("license"),
        "category": item.get("category"),
        "platform": item.get("platform"),
        "stars": item.get("stars"),
        "forks": item.get("forks"),
        "pushedAt": item.get("pushedAt"),
        "latestReleaseAt": item.get("latestReleaseAt"),
        "topics": item.get("topics") or [],
        "archived": item.get("archived"),
    }


def render_input(readme: str, metadata: dict[str, object]) -> str:
    body = (readme or "").strip()[:README_INPUT_CHARS]
    return (
        f"[README]\n{body or 'unknown'}\n[/README]\n"
        f"[METADATA]\n{json.dumps(metadata, ensure_ascii=False, default=str)}\n[/METADATA]"
    )


def fallback_summary(metadata: dict[str, object]) -> str:
    """模型不可用时的规则摘要：只拼接已知事实，保证 rerank 文档非空。"""
    parts: list[str] = []
    description = str(metadata.get("description") or "").strip()
    if description:
        parts.append(description)
    else:
        parts.append(str(metadata.get("fullName") or "unknown repository"))
    stars = metadata.get("stars")
    forks = metadata.get("forks")
    if stars is not None:
        parts.append(f"{stars} stars, {forks or 0} forks")
    if metadata.get("language"):
        parts.append(f"written in {metadata['language']}")
    if metadata.get("license"):
        parts.append(f"license {metadata['license']}")
    if metadata.get("platform"):
        parts.append(f"platform {metadata['platform']}")
    if metadata.get("pushedAt"):
        parts.append(f"last push {metadata['pushedAt']}")
    if metadata.get("latestReleaseAt"):
        parts.append(f"latest release {metadata['latestReleaseAt']}")
    topics = metadata.get("topics")
    if isinstance(topics, list) and topics:
        parts.append("topics " + ", ".join(str(topic) for topic in topics[:8]))
    return "; ".join(parts)[:SUMMARY_LIMIT]


class RepoSummarizer:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: httpx.AsyncClient | None = None

    def _connect(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=max(30.0, self._settings.readme_translate_timeout_seconds)
            )
        return self._client

    async def summarize(self, *, readme: str, metadata: dict[str, object]) -> str:
        """返回 ≤500 字符的摘要；调用失败抛 SummaryError，由调用方降级。"""
        prompt = render_input(readme, metadata)
        attempts = 2
        last_error: Exception | None = None
        for attempt in range(attempts):
            try:
                text = await self._chat(prompt)
            except Exception as exc:  # 限流、超时、空输出统一退避重试
                last_error = exc
                await asyncio.sleep(min(2.0 * (2**attempt), 6.0))
                continue
            cleaned = " ".join(text.split()).strip()
            if cleaned:
                return cleaned[:SUMMARY_LIMIT]
            last_error = SummaryError("模型返回空摘要")
        raise SummaryError(f"摘要生成失败：{last_error}")

    async def _chat(self, text: str) -> str:
        settings = self._settings
        if not settings.llm_api_key:
            raise SummaryError("LLM_API_KEY 未配置，无法生成仓库摘要")
        payload: dict[str, object] = {
            "model": settings.llm_chat_model,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
            "temperature": 0.2,
            "max_tokens": 400,
        }
        if settings.llm_thinking_mode in ("enabled", "disabled"):
            payload["thinking"] = {"type": settings.llm_thinking_mode}
        response = await self._connect().post(
            f"{settings.llm_base_url.rstrip('/')}/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
        )
        if response.status_code >= 400:
            raise SummaryError(f"模型返回 {response.status_code}")
        body = response.json()
        choices = body.get("choices") if isinstance(body, dict) else None
        message = choices[0].get("message") if isinstance(choices, list) and choices else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            raise SummaryError("模型返回空内容")
        return content

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
