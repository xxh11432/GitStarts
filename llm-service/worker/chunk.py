"""README 分块：按 Markdown 标题切分，滑动窗口控制在目标 token 区间。"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
_CJK = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")
_WORD = re.compile(r"[A-Za-z0-9_]+")
_PUNCT = re.compile(r"[^\sA-Za-z0-9_\u4e00-\u9fff]")


@dataclass(frozen=True)
class Chunk:
    section: str
    content: str
    token_count: int
    chunk_hash: str


def estimate_tokens(text: str) -> int:
    """中英混排的近似 token 数：CJK 按字、拉丁按词，标点按 4 个计 1。"""
    if not text:
        return 0
    cjk = len(_CJK.findall(text))
    words = len(_WORD.findall(text))
    punct = len(_PUNCT.findall(text)) // 4
    return cjk + words + punct


def chunk_markdown(
    content: str,
    *,
    target_tokens: int = 600,
    min_tokens: int = 400,
    max_tokens: int = 800,
    overlap_tokens: int = 80,
) -> list[Chunk]:
    cleaned = _normalize(content)
    if not cleaned:
        return []

    chunks: list[Chunk] = []
    for section, body in _sections(cleaned):
        blocks = [block for block in re.split(r"\n{2,}", body) if block.strip()]
        if not blocks:
            continue
        chunks.extend(
            _window(
                section,
                blocks,
                target_tokens=target_tokens,
                min_tokens=min_tokens,
                max_tokens=max_tokens,
                overlap_tokens=overlap_tokens,
            )
        )
    return chunks


def _sections(content: str) -> list[tuple[str, str]]:
    matches = list(_HEADING.finditer(content))
    if not matches:
        return [("README", content)]

    sections: list[tuple[str, str]] = []
    preamble = content[: matches[0].start()].strip()
    if estimate_tokens(preamble) >= 40:
        sections.append(("README", preamble))

    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        title = match.group(2).strip()
        body = content[match.start() : end].strip()
        sections.append((title, body))
    return sections


def _window(
    section: str,
    blocks: list[str],
    *,
    target_tokens: int,
    min_tokens: int,
    max_tokens: int,
    overlap_tokens: int,
) -> list[Chunk]:
    chunks: list[Chunk] = []
    current: list[str] = []
    current_tokens = 0
    dirty = False

    def flush() -> None:
        nonlocal current, current_tokens, dirty
        if not current:
            return
        text = _join(section, current)
        tokens = estimate_tokens(text)
        if tokens >= 20:
            chunks.append(_make_chunk(section, text, tokens))
        # 保留尾部作为下一块的上下文（超长块不参与重叠，避免重复内容膨胀）
        carry: list[str] = []
        carry_tokens = 0
        while current:
            tail = current[-1]
            tail_tokens = estimate_tokens(tail)
            if tail_tokens > overlap_tokens * 2:
                break
            if carry and carry_tokens + tail_tokens > overlap_tokens:
                break
            carry.insert(0, tail)
            carry_tokens += tail_tokens
            current.pop()
        current = carry
        current_tokens = carry_tokens
        dirty = False

    for block in blocks:
        block_tokens = estimate_tokens(block)
        if block_tokens > max_tokens:
            for piece in _split_long(block, max_tokens):
                piece_tokens = estimate_tokens(piece)
                if current and current_tokens + piece_tokens > max_tokens:
                    flush()
                current.append(piece)
                current_tokens += piece_tokens
                dirty = True
                if current_tokens >= target_tokens:
                    flush()
            continue

        if current and current_tokens + block_tokens > max_tokens:
            flush()
        current.append(block)
        current_tokens += block_tokens
        dirty = True
        if current_tokens >= target_tokens:
            flush()

    # 收尾：过短的尾块并回上一块，避免碎片；只有新增内容才处理
    if dirty and current:
        text = _join(section, current)
        tokens = estimate_tokens(text)
        if tokens >= 20:
            if tokens < min_tokens and chunks and chunks[-1].section == section:
                merged = chunks[-1].content + "\n\n" + text
                merged_tokens = estimate_tokens(merged)
                if merged_tokens <= max_tokens:
                    chunks[-1] = _make_chunk(section, merged, merged_tokens)
                else:
                    chunks.append(_make_chunk(section, text, tokens))
            else:
                chunks.append(_make_chunk(section, text, tokens))
    return chunks


def _split_long(block: str, max_tokens: int) -> list[str]:
    sentences = re.split(r"(?<=[。！？.!?])\s*|\n", block)
    pieces: list[str] = []
    current: list[str] = []
    current_tokens = 0
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        tokens = estimate_tokens(sentence)
        if tokens > max_tokens:
            # 极端长行：按字符硬切
            step = max(200, max_tokens * 2)
            pieces.extend(sentence[i : i + step] for i in range(0, len(sentence), step))
            continue
        if current and current_tokens + tokens > max_tokens:
            pieces.append(" ".join(current))
            current = []
            current_tokens = 0
        current.append(sentence)
        current_tokens += tokens
    if current:
        pieces.append(" ".join(current))
    return pieces


def _join(section: str, blocks: list[str]) -> str:
    body = "\n\n".join(blocks).strip()
    if body.startswith("#"):
        return body
    return f"## {section}\n\n{body}"


def _make_chunk(section: str, content: str, tokens: int) -> Chunk:
    digest = hashlib.sha256(f"{section}\n{_normalize(content)}".encode()).hexdigest()[:32]
    return Chunk(section=section, content=content, token_count=tokens, chunk_hash=digest)


def _normalize(content: str) -> str:
    lines = [line.rstrip() for line in content.replace("\r\n", "\n").split("\n")]
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
