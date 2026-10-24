from worker.chunk import chunk_markdown, estimate_tokens
from worker.fetch_docs import clean_markdown


def test_estimate_tokens_counts_cjk_and_words() -> None:
    assert estimate_tokens("中文") == 2
    assert estimate_tokens("hello world") == 2
    assert estimate_tokens("") == 0


def test_chunk_markdown_splits_sections_and_is_stable() -> None:
    body = "\n\n".join(f"这是第 {index} 段说明，介绍安装与使用方式。" for index in range(80))
    content = f"# 项目\n\n简介\n\n## 安装\n\n{body}\n\n## 配置\n\n{body}"
    chunks = chunk_markdown(
        content, target_tokens=60, min_tokens=30, max_tokens=100, overlap_tokens=10
    )
    assert chunks
    assert {chunk.section for chunk in chunks} >= {"安装", "配置"}
    assert all(chunk.content for chunk in chunks)
    assert all(chunk.token_count <= 140 for chunk in chunks)

    again = chunk_markdown(
        content, target_tokens=60, min_tokens=30, max_tokens=100, overlap_tokens=10
    )
    assert [chunk.chunk_hash for chunk in chunks] == [chunk.chunk_hash for chunk in again]


def test_chunk_markdown_empty() -> None:
    assert chunk_markdown("   \n\n") == []


def test_clean_markdown_removes_scripts_and_html() -> None:
    raw = (
        "# Demo\n\n<script>alert(1)</script>\n"
        "<div>hello <b>world</b></div>\n<!-- ignore -->\n"
        "<style>body{}</style>\n<a href='https://example.com'>link</a>"
    )
    cleaned = clean_markdown(raw)
    assert "script" not in cleaned.lower()
    assert "alert" not in cleaned
    assert "<b>" not in cleaned
    assert "ignore" not in cleaned
    assert "hello world" in cleaned
    assert "link" in cleaned
