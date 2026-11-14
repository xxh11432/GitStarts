from types import SimpleNamespace
from typing import Any

import pytest

from app.core.config import Settings
from worker.chunk import chunk_markdown
from worker.index import build_points, index_readme
from worker.pipeline import FULL_CURSOR_KEY, run_index_pass
from worker.translate import TranslationError


class FakeVector:
    def __init__(self) -> None:
        self.deleted: list[int] = []
        self.upserted: list[Any] = []

    async def ensure_collection(self) -> None:
        return None

    async def delete_repo(self, repo_id: int, *, chunk_type: str | None = None) -> None:
        self.deleted.append(repo_id)

    async def upsert_chunks(self, points: list[Any]) -> int:
        self.upserted.extend(points)
        return len(points)


class FakeEmbedding:
    async def embed(self, chunks: list[Any]) -> dict[str, list[float]]:
        return {chunk.chunk_hash: [0.1, 0.2] for chunk in chunks}


@pytest.fixture
def settings() -> Settings:
    return Settings(
        environment="test",
        qdrant_url="http://127.0.0.1:9",
        backend_url="http://127.0.0.1:9",
        checkpoint_redis_url="redis://127.0.0.1:9/0",
        llm_embedding_dim=2,
    )


async def test_index_readme_deletes_then_upserts(settings: Settings) -> None:
    vector = FakeVector()
    repo = {
        "repoId": 42,
        "fullName": "owner/repo",
        "pushedAt": "2025-01-01T00:00:00",
        "language": "Python",
        "category": "AI",
        "license": "MIT",
        "platform": "linux",
        "stars": 100,
    }
    content = "## 功能\n\n" + "\n\n".join(f"第 {index} 段功能说明。" for index in range(50))
    count = await index_readme(
        settings,
        vector,  # type: ignore[arg-type]
        FakeEmbedding(),  # type: ignore[arg-type]
        repo=repo,
        content=content,
        sha="abc",
        source_url="https://github.com/owner/repo",
    )
    assert vector.deleted == [42]
    assert count > 0
    assert all(point.repo_id == 42 for point in vector.upserted)
    assert all(point.payload["license"] == "MIT" for point in vector.upserted)


def test_build_points_are_stable_for_same_chunk() -> None:
    content = "## 安装\n\n" + "\n\n".join(
        f"运行 docker compose up 即可启动第 {index} 个服务。" for index in range(30)
    )
    chunks = chunk_markdown(content)
    assert chunks
    repo = {"repoId": 1, "fullName": "owner/repo"}
    vectors = {chunk.chunk_hash: [0.1, 0.2] for chunk in chunks}
    first = build_points(repo=repo, chunks=chunks, vectors=vectors, sha="a", source_url="u")
    second = build_points(repo=repo, chunks=chunks, vectors=vectors, sha="a", source_url="u")
    assert [point.point_id for point in first] == [point.point_id for point in second]
    assert all(point.payload["repo_id"] == 1 for point in first)


async def test_index_readme_empty_content(settings: Settings) -> None:
    vector = FakeVector()
    count = await index_readme(
        settings,
        vector,  # type: ignore[arg-type]
        FakeEmbedding(),  # type: ignore[arg-type]
        repo={"repoId": 7, "fullName": "owner/empty"},
        content="",
        sha="",
        source_url=None,
    )
    assert count == 0
    assert vector.deleted == [7]
    assert vector.upserted == []


class FakeCache:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    async def acquire_lock(self, key: str, ttl: int) -> bool:
        return True

    async def release_lock(self, key: str) -> None:
        self.values.pop(key, None)

    async def get_text(self, key: str) -> str | None:
        return self.values.get(key)

    async def set_text(self, key: str, value: str, ttl: int | None = None) -> None:
        self.values[key] = value

    async def delete(self, key: str) -> None:
        self.values.pop(key, None)


class FakeIndexBackend:
    def __init__(self, pages: dict[int, list[dict[str, Any]]]) -> None:
        self.pages = pages
        self.cursors: list[int | None] = []
        self.upserts: list[dict[str, Any]] = []

    async def list_index_repos(self, *, cursor: int | None = None, limit: int = 100) -> Any:
        self.cursors.append(cursor)
        items = self.pages.get(int(cursor or 0), [])
        return {"items": items, "nextCursor": items[-1]["repoId"] if items else None}

    async def mark_indexed(self, repo_ids: list[int]) -> None:
        return None

    async def upsert_repo_document(self, **kwargs: Any) -> int:
        self.upserts.append(kwargs)
        return 1


class FakeFetcher:
    async def fetch_readme(self, full_name: str, etag: str | None = None) -> Any:
        return SimpleNamespace(
            unchanged=True, content="", sha="", etag="v1", source_url="", token_count=0
        )

    async def fetch_manifest(self, full_name: str, *, language: str | None) -> Any:
        return SimpleNamespace(
            path="requirements.txt",
            content="# requirements.txt\nfastapi",
            sha="m1",
            source_url="https://github.com/o/r/blob/main/requirements.txt",
            token_count=4,
        )


class FakeReadmeFetcher:
    def __init__(self, content: str) -> None:
        self.content = content

    async def fetch_readme(self, full_name: str, etag: str | None = None) -> Any:
        return SimpleNamespace(
            unchanged=False,
            content=self.content,
            sha="sha1",
            etag="etag1",
            source_url="https://github.com/owner/repo",
            token_count=1,
        )

    async def fetch_manifest(self, full_name: str, *, language: str | None) -> Any:
        return None


class FakeTranslator:
    def __init__(self) -> None:
        self.calls = 0

    async def translate(self, content: str) -> str:
        self.calls += 1
        return "## Project\n\nTranslated English README.\n\nEnglish text. " * 40


class FailingTranslator:
    async def translate(self, content: str) -> str:
        raise TranslationError("upstream error")


async def test_readme_translated_before_upsert_and_index(settings: Settings) -> None:
    chinese = "# 项目\n\n" + "这是一个中文说明，介绍安装与配置步骤。\n\n" * 20
    backend = FakeIndexBackend({0: [{"repoId": 5, "fullName": "owner/cn"}]})
    vector = FakeVector()
    translator = FakeTranslator()

    stats = await run_index_pass(
        settings,
        backend=backend,  # type: ignore[arg-type]
        fetcher=FakeReadmeFetcher(chinese),  # type: ignore[arg-type]
        embedding=FakeEmbedding(),  # type: ignore[arg-type]
        vector=vector,  # type: ignore[arg-type]
        cache=FakeCache(),  # type: ignore[arg-type]
        translator=translator,  # type: ignore[arg-type]
        full=True,
    )

    assert stats.indexed == 1
    assert translator.calls == 1
    readme = [upsert for upsert in backend.upserts if upsert.get("kind") == "readme"][-1]
    assert readme["lang"] == 1
    assert "Translated English README" in readme["content"]
    assert any(
        "Translated English README" in str(point.payload.get("content"))
        for point in vector.upserted
    )


async def test_translation_failure_keeps_original_and_marks_failed(settings: Settings) -> None:
    chinese = "# 项目\n\n" + "这是一个中文说明，介绍安装与配置步骤。\n\n" * 20
    backend = FakeIndexBackend({0: [{"repoId": 6, "fullName": "owner/cn2"}]})
    vector = FakeVector()

    await run_index_pass(
        settings,
        backend=backend,  # type: ignore[arg-type]
        fetcher=FakeReadmeFetcher(chinese),  # type: ignore[arg-type]
        embedding=FakeEmbedding(),  # type: ignore[arg-type]
        vector=vector,  # type: ignore[arg-type]
        cache=FakeCache(),  # type: ignore[arg-type]
        translator=FailingTranslator(),  # type: ignore[arg-type]
        full=True,
    )

    readme = [upsert for upsert in backend.upserts if upsert.get("kind") == "readme"][-1]
    assert readme["lang"] == 2
    assert readme["content"] == chinese
    assert any(
        "这是一个中文说明" in str(point.payload.get("content")) for point in vector.upserted
    )


async def test_full_pass_resumes_from_cursor(settings: Settings) -> None:
    pages = {
        0: [{"repoId": 1, "fullName": "o/r1"}, {"repoId": 2, "fullName": "o/r2"}],
        1: [{"repoId": 2, "fullName": "o/r2"}, {"repoId": 3, "fullName": "o/r3"}],
        2: [{"repoId": 3, "fullName": "o/r3"}],
    }
    backend = FakeIndexBackend(pages)
    cache = FakeCache()
    capped = settings.model_copy(update={"index_max_repos": 1})
    full_cursor = f"{FULL_CURSOR_KEY}:{capped.qdrant_collection}"

    first = await run_index_pass(
        capped,
        backend=backend,  # type: ignore[arg-type]
        fetcher=FakeFetcher(),  # type: ignore[arg-type]
        embedding=FakeEmbedding(),  # type: ignore[arg-type]
        vector=FakeVector(),  # type: ignore[arg-type]
        cache=cache,  # type: ignore[arg-type]
        full=True,
    )
    assert first.processed == 1
    assert cache.values[full_cursor] == "1"

    await run_index_pass(
        capped,
        backend=backend,  # type: ignore[arg-type]
        fetcher=FakeFetcher(),  # type: ignore[arg-type]
        embedding=FakeEmbedding(),  # type: ignore[arg-type]
        vector=FakeVector(),  # type: ignore[arg-type]
        cache=cache,  # type: ignore[arg-type]
        full=True,
    )
    assert cache.values[full_cursor] == "2"
    assert backend.cursors == [0, 1]

    await run_index_pass(
        settings,
        backend=backend,  # type: ignore[arg-type]
        fetcher=FakeFetcher(),  # type: ignore[arg-type]
        embedding=FakeEmbedding(),  # type: ignore[arg-type]
        vector=FakeVector(),  # type: ignore[arg-type]
        cache=cache,  # type: ignore[arg-type]
        full=True,
    )
    assert full_cursor not in cache.values
    assert backend.cursors == [0, 1, 2, 3]
