from typing import Any

import pytest

from app.core.config import Settings
from app.graphs.compare_graph import (
    CompareError,
    CompareRunner,
    PreparedCompare,
    fallback_cells,
)
from app.schemas.compare import (
    DIMENSION_KEYS,
    LlmCell,
    LlmRepoCells,
    LlmVerdict,
    RepoAnalysis,
)
from app.schemas.match import Requirement
from app.tools.doc_tools import EvidenceHit

USER_ID = 7


def _repo(full_name: str, repo_id: int) -> dict[str, Any]:
    return {
        "id": repo_id,
        "fullName": full_name,
        "description": "自托管知识库",
        "language": "TypeScript",
        "license": "Apache-2.0",
        "stars": 1200,
        "category": "AI",
        "platform": "docker",
        "pushedAt": "2025-09-01T00:00:00",
        "topics": ["knowledge-base"],
    }


def _hit(section: str = "Features") -> EvidenceHit:
    return EvidenceHit(
        section=section,
        snippet="支持 Docker 私有部署，提供 REST API 与插件机制。",
        source_url="https://github.com/example/repo/blob/main/README.md",
        chunk_type="readme",
        score=0.88,
    )


class FakeDocs:
    def __init__(self, *, empty_for: set[str] | None = None) -> None:
        self.empty_for = empty_for or set()
        self.closed = False

    async def collect_dimension_evidence(
        self, *, repo_id: int, goal: str, top_k: int | None = None
    ) -> dict[str, list[EvidenceHit]]:
        if repo_id in self.empty_for:
            return {key: [] for key in DIMENSION_KEYS}
        return {key: [_hit(key)] for key in DIMENSION_KEYS}

    async def collect_overview_evidence(
        self, *, repo_id: int, goal: str, description: str, top_k: int = 4
    ) -> list[EvidenceHit]:
        return [] if repo_id in self.empty_for else [_hit("README")]

    async def search_repo_docs(
        self, *, repo_id: int, query: str, top_k: int = 6, chunk_types=None
    ) -> list[EvidenceHit]:
        return [] if repo_id in self.empty_for else [_hit("README")]

    async def close(self) -> None:
        self.closed = True


class FakeLlm:
    def __init__(self, *, break_verdict: bool = False) -> None:
        self.calls: list[type] = []
        self.break_verdict = break_verdict

    def with_structured_output(self, schema: type, method: str | None = None) -> Any:
        outer = self

        class Runnable:
            async def ainvoke(
                self, messages: list[Any], config: Any = None
            ) -> Any:
                outer.calls.append(schema)
                if schema is RepoAnalysis:
                    return RepoAnalysis(
                        summary="自托管知识库",
                        architecture="前后端分离",
                        pros=["可私有部署"],
                        cons=["依赖较多"],
                        use_cases=["团队知识库"],
                    )
                if schema is LlmRepoCells:
                    return LlmRepoCells(
                        cells=[
                            LlmCell(
                                key=key,
                                value=f"{key} 的结论",
                                confidence=0.8,
                                evidence_sections=[key],
                            )
                            for key in DIMENSION_KEYS
                        ]
                    )
                if schema is LlmVerdict:
                    if outer.break_verdict:
                        raise RuntimeError("verdict down")
                    return LlmVerdict(
                        recommended=["example/one"],
                        reasons=["证据覆盖度高"],
                        caveats=["许可证待法务确认"],
                    )
                raise AssertionError(f"unexpected schema {schema}")

        return Runnable()


class FakeBackend:
    def __init__(self, repos: list[dict[str, Any]] | None = None) -> None:
        self.repos = repos or [_repo("example/one", 1), _repo("example/two", 2)]
        self.comparisons: list[dict[str, Any]] = []

    async def get_repos_batch(self, full_names: list[str]) -> list[dict[str, Any]]:
        wanted = set(full_names)
        return [repo for repo in self.repos if repo["fullName"] in wanted]

    async def create_comparison(self, **kwargs: Any) -> int:
        self.comparisons.append(kwargs)
        return 321

    async def get_idea(self, idea_id: int, *, user_id: int) -> dict[str, Any]:
        raise AssertionError("not used")

    async def create_idea(self, **kwargs: Any) -> int:
        raise AssertionError("not used")

    async def update_idea(self, idea_id: int, structured: dict[str, Any]) -> dict[str, Any]:
        raise AssertionError("not used")


class FakeVector:
    def __init__(self) -> None:
        self.closed = False

    async def close(self) -> None:
        self.closed = True


class FakeEmbedding:
    async def embed_query(self, text: str) -> list[float]:
        return [0.1, 0.2]

    async def embed_queries(self, texts: list[str]) -> list[list[float]]:
        return [[0.1, 0.2] for _ in texts]


class FakeCache:
    def __init__(self) -> None:
        self.data: dict[str, dict[str, Any]] = {}

    async def get_json(self, key: str) -> dict[str, Any] | None:
        return self.data.get(key)

    async def set_json(self, key: str, value: dict[str, Any], ttl: int) -> None:
        self.data[key] = value

    async def delete(self, key: str) -> None:
        self.data.pop(key, None)

    async def close(self) -> None:
        return None


@pytest.fixture
def settings() -> Settings:
    return Settings(
        environment="test",
        qdrant_url="http://127.0.0.1:9",
        backend_url="http://127.0.0.1:9",
        checkpoint_redis_url="redis://127.0.0.1:9/0",
    )


def _runner(
    settings: Settings,
    *,
    backend: FakeBackend | None = None,
    cache: FakeCache | None = None,
    llm: FakeLlm | None = None,
    docs: FakeDocs | None = None,
) -> CompareRunner:
    return CompareRunner(
        settings=settings,
        backend=backend or FakeBackend(),  # type: ignore[arg-type]
        vector=FakeVector(),  # type: ignore[arg-type]
        embedding=FakeEmbedding(),  # type: ignore[arg-type]
        llm=llm or FakeLlm(),
        cache=cache or FakeCache(),  # type: ignore[arg-type]
        docs=docs or FakeDocs(),  # type: ignore[arg-type]
    )


def _request(force: bool = False) -> Any:
    from app.schemas.compare import CompareRequest

    return CompareRequest(
        structured=Requirement(goal="自托管团队知识库", must=[]),
        repo_keys=["example/one", "example/two"],
        force=force,
    )


async def _collect(runner: CompareRunner, request: Any) -> tuple[list[Any], PreparedCompare]:
    prepared = await runner.prepare(request, user_id=USER_ID)
    events = [event async for event in runner.run(prepared, user_id=USER_ID)]
    return events, prepared


async def test_compare_emits_matrix_and_persists(settings: Settings) -> None:
    backend = FakeBackend()
    llm = FakeLlm()
    runner = _runner(settings, backend=backend, llm=llm)

    events, prepared = await _collect(runner, _request())

    names = [event.name for event in events]
    assert names[0] == "plan"
    assert names[-1] == "done"
    assert names.count("cell") == len(DIMENSION_KEYS) * 2
    assert "verdict" in names

    plan = events[0].data
    assert plan["cached"] is False
    assert [repo["fullName"] for repo in plan["repos"]] == ["example/one", "example/two"]
    assert len(plan["dimensions"]) == len(DIMENSION_KEYS)

    cells = [event.data for event in events if event.name == "cell"]
    for cell in cells:
        assert cell["value"]
        assert cell["evidence"], "每格必须有证据"
        assert cell["evidence"][0]["sourceUrl"].startswith("https://github.com/")
        assert cell["confidence"] > 0

    verdict = next(event.data for event in events if event.name == "verdict")
    assert verdict["recommended"] == ["example/one"]
    assert verdict["caveats"]

    done = events[-1].data
    assert done["cached"] is False
    assert done["comparisonId"] == 321
    assert backend.comparisons
    payload = backend.comparisons[0]
    assert payload["repo_keys"] == ["example/one", "example/two"]
    assert len(payload["result"]["cells"]) == len(DIMENSION_KEYS) * 2
    assert payload["cache_key"] == prepared.cache_key


async def test_compare_marks_missing_evidence_as_insufficient(settings: Settings) -> None:
    runner = _runner(settings, docs=FakeDocs(empty_for={2}))

    events, _ = await _collect(runner, _request())
    cells = [event.data for event in events if event.name == "cell"]
    second = [cell for cell in cells if cell["repoKey"] == "example/two"]
    assert second
    assert all(cell["value"] == "信息不足" for cell in second)
    assert all(cell["confidence"] == 0 for cell in second)
    assert all(not cell["evidence"] for cell in second)


async def test_compare_cache_hit_skips_generation(settings: Settings) -> None:
    cache = FakeCache()
    backend = FakeBackend()
    first_runner = _runner(settings, backend=backend, cache=cache)
    await _collect(first_runner, _request())
    calls_after_first = len(backend.comparisons)

    llm = FakeLlm()
    second_runner = _runner(settings, backend=backend, cache=cache, llm=llm)
    prepared = await second_runner.prepare(_request(), user_id=USER_ID)
    assert prepared.cached is not None

    events = [event async for event in second_runner.run(prepared, user_id=USER_ID)]
    assert events[0].name == "plan"
    assert events[0].data["cached"] is True
    assert events[-1].data["cached"] is True
    assert events[-1].data["comparisonId"] == 321
    assert len(backend.comparisons) == calls_after_first
    assert not llm.calls


async def test_compare_cache_replay_does_not_require_llm_parse(settings: Settings) -> None:
    from app.schemas.compare import CompareRequest

    backend = FakeBackend()
    cache = FakeCache()
    runner = _runner(settings, backend=backend, cache=cache)
    request = CompareRequest(raw_text="自托管知识库", repo_keys=["example/one", "example/two"])

    prepared = await runner.prepare_light(request, user_id=USER_ID)
    assert prepared.requirement is None
    await cache.set_json(
        prepared.cache_key,
        {"cells": [], "verdict": {}, "comparisonId": 321, "generatedAt": "2026-01-01T00:00:00Z"},
        60,
    )

    replay = await runner.prepare_light(request, user_id=USER_ID)
    assert replay.cached is not None
    assert replay.requirement is None

    events = [event async for event in runner.run(replay, user_id=USER_ID)]
    assert events[0].name == "plan"
    assert events[-1].name == "done"
    assert events[-1].data["cached"] is True
    assert not backend.comparisons


async def test_compare_resumes_from_checkpoint(settings: Settings) -> None:
    backend = FakeBackend()
    cache = FakeCache()
    runner = _runner(settings, backend=backend, cache=cache)
    prepared = await runner.prepare(_request(), user_id=USER_ID)
    cached_repo_cells = fallback_cells("example/one")
    await cache.set_json(
        f"cmp:ckpt:{prepared.cache_key}",
        {"cells": {"example/one": [cell.model_dump(by_alias=True) for cell in cached_repo_cells]}},
        3600,
    )

    resumed_prepared = await runner.prepare(_request(), user_id=USER_ID)
    assert resumed_prepared.cached is None
    assert resumed_prepared.checkpoint is not None

    llm = FakeLlm()
    runner_with_llm = _runner(settings, backend=backend, cache=cache, llm=llm)
    events = [event async for event in runner_with_llm.run(resumed_prepared, user_id=USER_ID)]
    cells = [event.data for event in events if event.name == "cell"]
    assert len(cells) == len(DIMENSION_KEYS) * 2
    first_repo = [cell for cell in cells if cell["repoKey"] == "example/one"]
    assert all(cell["value"] == "信息不足" for cell in first_repo)  # 断点续跑回放
    assert len(llm.calls) == 3  # analysis + cells + verdict，只重跑未完成的仓库


async def test_compare_rejects_duplicate_or_too_few_repos(settings: Settings) -> None:
    runner = _runner(settings)
    from app.schemas.compare import CompareRequest

    with pytest.raises(CompareError) as excinfo:
        await runner.prepare(
            CompareRequest(structured=Requirement(goal="x"), repo_keys=["a/b"]),
            user_id=USER_ID,
        )
    assert excinfo.value.code == "invalid_repos"

    with pytest.raises(CompareError) as excinfo:
        await runner.prepare(
            CompareRequest(structured=Requirement(goal="x"), repo_keys=["a/b", "A/B"]),
            user_id=USER_ID,
        )
    assert excinfo.value.code == "invalid_repos"


async def test_compare_falls_back_to_heuristic_verdict(settings: Settings) -> None:
    runner = _runner(settings, llm=FakeLlm(break_verdict=True))
    events, _ = await _collect(runner, _request())
    verdict = next(event.data for event in events if event.name == "verdict")
    assert verdict["recommended"]
    assert any("自动排序" in reason for reason in verdict["reasons"])
    assert events[-1].name == "done"
