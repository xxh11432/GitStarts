from __future__ import annotations

import pytest

from app.core.config import Settings
from worker.summarize import (
    SUMMARY_LIMIT,
    RepoSummarizer,
    SummaryError,
    build_metadata,
    fallback_summary,
    render_input,
)


def test_fallback_summary_only_uses_facts() -> None:
    metadata = build_metadata(
        {
            "fullName": "acme/notes",
            "description": "Self-hosted note taking app",
            "stars": 1200,
            "forks": 80,
            "language": "TypeScript",
            "license": "MIT",
            "pushedAt": "2026-11-01T00:00:00Z",
            "latestReleaseAt": "2026-10-01T00:00:00Z",
            "topics": ["notes", "self-hosted"],
        }
    )
    text = fallback_summary(metadata)
    assert "Self-hosted note taking app" in text
    assert "1200 stars" in text
    assert "MIT" in text
    assert "notes, self-hosted" in text
    assert len(text) <= SUMMARY_LIMIT


def test_render_input_truncates_readme() -> None:
    metadata = build_metadata({"fullName": "acme/notes"})
    text = render_input("x" * 20000, metadata)
    assert "[METADATA]" in text
    assert len(text) < 7000


async def test_summarize_truncates_model_output() -> None:
    summarizer = RepoSummarizer(Settings())

    async def fake_chat(prompt: str) -> str:
        return "feature " * 200

    summarizer._chat = fake_chat  # type: ignore[method-assign]
    output = await summarizer.summarize(readme="readme text", metadata={"fullName": "a/b"})
    assert len(output) == SUMMARY_LIMIT


async def test_summarize_raises_when_model_returns_empty() -> None:
    summarizer = RepoSummarizer(Settings())

    async def empty_chat(prompt: str) -> str:
        return "   "

    summarizer._chat = empty_chat  # type: ignore[method-assign]
    with pytest.raises(SummaryError):
        await summarizer.summarize(readme="readme", metadata={})
