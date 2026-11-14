"""README 翻译：把非英文 README（含中英混排）转换为英文后再入库。

- 代码块先用占位符屏蔽，避免模型改动命令/示例，也避免把代码当正文翻译；
- 按 Markdown 段落切窗口，逐窗口调用 OpenAI 兼容的 chat/completions；
- 任一窗口失败或占位符丢失即抛错，由调用方标记 lang=2，保留原文等待下轮重试。
"""

from __future__ import annotations

import asyncio
import re

import httpx
import structlog

from app.core.config import Settings

logger = structlog.get_logger("translate")

_FENCED = re.compile(r"```.*?```", re.DOTALL)
_PLACEHOLDER = re.compile(r"`{0,3}\s*\[\[CODE_BLOCK_(\d+)\]\]\s*`{0,3}")

_SYSTEM_PROMPT = (
    "You are a professional technical translator. Translate the Markdown README "
    "segment into natural, idiomatic English. Preserve the Markdown structure and "
    "every non-prose element exactly: headings, lists, tables, fenced and inline "
    "code, URLs, image links, badges, HTML tags, and placeholders such as "
    "[[CODE_BLOCK_0]]. Keep product names, CLI commands, file paths and technical "
    "terms unchanged. If the segment already contains English prose, keep its "
    "meaning and tone instead of rewriting it. Do not add notes, explanations or "
    "extra sections; output only the translated Markdown."
)


class TranslationError(RuntimeError):
    """README 翻译失败（配置缺失、上游报错、输出异常）。"""


class ReadmeTranslator:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: httpx.AsyncClient | None = None

    def _connect(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            timeout = self._settings.readme_translate_timeout_seconds
            self._client = httpx.AsyncClient(timeout=timeout)
        return self._client

    async def translate(self, content: str) -> str:
        if not content.strip():
            return content
        masked, blocks = _mask_code_blocks(content)
        windows = split_windows(masked, self._settings.readme_translate_window_chars)
        translated: list[str] = []
        for index, window in enumerate(windows):
            try:
                translated.append(await self._translate_window(window))
            except TranslationError:
                raise
            except Exception as exc:  # 网络/解析异常统一收敛，交给调用方重试
                raise TranslationError(f"翻译窗口 {index} 失败：{type(exc).__name__}") from exc
        result = "\n\n".join(part.strip() for part in translated if part.strip())
        result = _restore_code_blocks(result, blocks)
        limit = self._settings.readme_translate_max_output_chars
        if len(result) > limit:
            logger.warning("translation_truncated", chars=len(result), limit=limit)
            result = result[:limit]
        return result

    async def _translate_window(self, window: str) -> str:
        attempts = max(1, self._settings.readme_translate_max_retries + 1)
        last_error: Exception | None = None
        for attempt in range(attempts):
            try:
                output = await self._chat(window)
            except Exception as exc:  # 限流、超时、空输出统一退避重试
                last_error = exc
                await asyncio.sleep(min(2.0 * (2**attempt), 8.0))
                continue
            expected = set(_PLACEHOLDER.findall(window))
            if set(_PLACEHOLDER.findall(output)) != expected:
                last_error = TranslationError("翻译结果丢失代码块占位符")
                continue
            return output
        raise TranslationError(f"翻译重试失败：{last_error}")

    async def _chat(self, text: str) -> str:
        settings = self._settings
        if not settings.llm_api_key:
            raise TranslationError("LLM_API_KEY 未配置，无法翻译 README")
        payload: dict[str, object] = {
            "model": settings.llm_chat_model,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
            "temperature": 0.1,
            "max_tokens": settings.readme_translate_max_tokens,
        }
        if settings.llm_thinking_mode in ("enabled", "disabled"):
            payload["thinking"] = {"type": settings.llm_thinking_mode}
        response = await self._connect().post(
            f"{settings.llm_base_url.rstrip('/')}/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
        )
        if response.status_code >= 400:
            raise TranslationError(f"模型返回 {response.status_code}")
        body = response.json()
        choices = body.get("choices") if isinstance(body, dict) else None
        message = choices[0].get("message") if isinstance(choices, list) and choices else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            raise TranslationError("模型返回空内容")
        return content

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None


def _mask_code_blocks(content: str) -> tuple[str, list[str]]:
    blocks: list[str] = []

    def replace(match: re.Match[str]) -> str:
        blocks.append(match.group(0))
        return f"[[CODE_BLOCK_{len(blocks) - 1}]]"

    return _FENCED.sub(replace, content), blocks


def _restore_code_blocks(content: str, blocks: list[str]) -> str:
    def replace(match: re.Match[str]) -> str:
        index = int(match.group(1))
        return blocks[index] if 0 <= index < len(blocks) else match.group(0)

    return _PLACEHOLDER.sub(replace, content)


def split_windows(text: str, max_chars: int) -> list[str]:
    """按空行分段聚合，尽量不切断段落；超长段落按行/字符硬切。"""
    if not text.strip():
        return []
    limit = max(200, max_chars)
    if len(text) <= limit:
        return [text]

    windows: list[str] = []
    current: list[str] = []
    size = 0

    def flush() -> None:
        nonlocal current, size
        if current:
            windows.append("\n\n".join(current))
            current = []
            size = 0

    for block in re.split(r"\n{2,}", text):
        if not block.strip():
            continue
        for piece in _split_oversized(block, limit):
            extra = len(piece) + (2 if current else 0)
            if current and size + extra > limit:
                flush()
            current.append(piece)
            size += extra
    flush()
    return windows


def _split_oversized(block: str, limit: int) -> list[str]:
    if len(block) <= limit:
        return [block]
    pieces: list[str] = []
    buffer = ""
    for line in block.split("\n"):
        while len(line) > limit:
            if buffer:
                pieces.append(buffer)
                buffer = ""
            pieces.append(line[:limit])
            line = line[limit:]
        candidate = f"{buffer}\n{line}" if buffer else line
        if len(candidate) > limit:
            pieces.append(buffer)
            buffer = line
        else:
            buffer = candidate
    if buffer:
        pieces.append(buffer)
    return pieces
