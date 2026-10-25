from typing import Any

import pytest

from app.clients.vector import VectorHit, build_filter
from app.core.config import Settings
from app.graphs.match_graph import (
    MatchError,
    MatchRunner,
    collect_hard_filters,
    evaluate_condition,
    fit_candidate,
    normalize_requirement,
    parse_requirement,
)
from app.schemas.match import (
    Condition,
    LlmRequirement,
    MatchRequest,
    Requirement,
    RerankItem,
    RerankResult,
)

USER_ID = 7


class FakeLlm:
    def __init__(
        self,
        *,
        requirement: LlmRequirement | None = None,
        rerank: RerankResult | None = None,
    ) -> None:
        self._requirement = requirement
        self._rerank = rerank
        self.calls = 0

    def with_structured_output(self, schema: type, method: str | None = None) -> Any:
        outer = self

        class Runnable:
            async def ainvoke(self, messages: list[Any], config: Any = None) -> Any:
                outer.calls += 1
                if schema is LlmRequirement:
                    return outer._requirement or LlmRequirement(goal="兜底目标")
                return outer._rerank or RerankResult(items=[])

        return Runnable()


class FakeBackend:
    def __init__(self, repos: list[dict[str, Any]] | None = None) -> None:
        self.repos = repos or [
            {
                "fullName": "langgenius/dify",
                "description": "LLM 应用开发平台，支持私有部署",
                "language": "TypeScript",
                "license": "Apache-2.0",
                "category": "AI",
                "platform": "other",
                "stars": 50000,
                "pushedAt": "2025-09-01T00:00:00",
                "topics": ["llm", "agent"],
            },
            {
                "fullName": "foo/legacy",
                "description": "旧项目",
                "language": "Python",
                "license": None,
                "category": "AI",
                "platform": "linux",
                "stars": 12,
                "pushedAt": "2019-01-01T00:00:00",
                "topics": [],
                "archived": True,
            },
        ]
        self.created: list[dict[str, Any]] = []
        self.updates: list[tuple[int, dict[str, Any]]] = []
        self.ideas: dict[int, dict[str, Any]] = {}

    async def reserve_chat_quota(self, user_id: int) -> dict[str, Any]:
        return {"allowed": True, "used": 1, "limit": 30, "remaining": 29}

    async def get_idea(self, idea_id: int, *, user_id: int) -> dict[str, Any]:
        return self.ideas[idea_id]

    async def create_idea(self, **kwargs: Any) -> int:
        self.created.append(kwargs)
        idea_id = 100 + len(self.created)
        self.ideas[idea_id] = {
            "id": idea_id,
            "rawText": kwargs["raw_text"],
            "structured": kwargs["structured"],
        }
        return idea_id

    async def update_idea(self, idea_id: int, structured: dict[str, Any]) -> dict[str, Any]:
        self.updates.append((idea_id, structured))
        self.ideas[idea_id]["structured"] = structured
        return self.ideas[idea_id]

    async def search_repos(self, **kwargs: Any) -> list[dict[str, Any]]:
        return []

    async def get_repos_batch(self, full_names: list[str]) -> list[dict[str, Any]]:
        requested = set(full_names)
        return [repo for repo in self.repos if repo["fullName"] in requested]


class FakeVector:
    def __init__(self, hits: list[VectorHit]) -> None:
        self._hits = hits
        self.filters: list[Any] = []
        self.closed = False

    async def search(
        self, vector: list[float], *, limit: int, query_filter: Any = None
    ) -> list[VectorHit]:
        self.filters.append(query_filter)
        return self._hits

    async def close(self) -> None:
        self.closed = True


class FakeEmbedding:
    async def embed_query(self, text: str) -> list[float]:
        return [0.1, 0.2, 0.3]


class FakeCache:
    def __init__(self) -> None:
        self.data: dict[str, dict[str, Any]] = {}

    async def get_json(self, key: str) -> dict[str, Any] | None:
        return self.data.get(key)

    async def set_json(self, key: str, value: dict[str, Any], ttl: int) -> None:
        self.data[key] = value

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


def _hits() -> list[VectorHit]:
    return [
        VectorHit(
            repo_id=1,
            full_name="langgenius/dify",
            score=0.86,
            section="Features",
            content="支持私有部署、LLM 应用编排与 Agent 工作流。",
            source_url="https://github.com/langgenius/dify/blob/main/README.md",
        ),
        VectorHit(
            repo_id=2,
            full_name="foo/legacy",
            score=0.42,
            section="README",
            content="旧项目，已停止维护。",
            source_url="https://github.com/foo/legacy/blob/main/README.md",
        ),
    ]


def _runner(settings: Settings, backend: FakeBackend, vector: FakeVector, llm: Any) -> MatchRunner:
    return MatchRunner(
        settings=settings,
        backend=backend,  # type: ignore[arg-type]
        vector=vector,  # type: ignore[arg-type]
        embedding=FakeEmbedding(),  # type: ignore[arg-type]
        llm=llm,
        cache=FakeCache(),  # type: ignore[arg-type]
    )


async def _collect(runner: MatchRunner, request: MatchRequest) -> list[Any]:
    return [event async for event in runner.run(request, user_id=USER_ID)]


async def test_match_with_structured_conditions(settings: Settings) -> None:
    backend = FakeBackend()
    vector = FakeVector(_hits())
    runner = _runner(settings, backend, vector, FakeLlm())
    requirement = Requirement(
        goal="搭建自建 AI 应用平台",
        must=[
            Condition(key="language", value="TypeScript"),
            Condition(key="license", value=["Apache-2.0", "MIT"]),
        ],
        exclude=["legacy"],
    )

    events = await _collect(
        runner,
        MatchRequest(
            raw_text="我想自建一个 AI 应用平台，要求 TypeScript 与宽松许可", structured=requirement
        ),
    )

    names = [event.name for event in events]
    assert names[0] == "status"
    assert "parsed" in names
    assert "candidate" in names
    assert names[-1] == "done"

    parsed = next(event for event in events if event.name == "parsed")
    assert parsed.data["requirement"]["must"][0]["key"] == "language"
    assert parsed.data["ideaId"] is not None
    assert backend.created

    candidates = [event.data for event in events if event.name == "candidate"]
    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate["repo"]["fullName"] == "langgenius/dify"
    assert candidate["fit"] > 0
    assert candidate["breakdown"]["semantic"] == 0.86
    assert candidate["breakdown"]["coverage"] == 1.0
    assert any(check["status"] == "hit" for check in candidate["conditions"])
    assert candidate["evidence"][0]["section"] == "Features"

    done = events[-1].data
    assert done["total"] == 1
    assert done["cached"] is False


async def test_match_parses_raw_text_with_llm(settings: Settings) -> None:
    backend = FakeBackend()
    vector = FakeVector(_hits())
    llm = FakeLlm(
        requirement=LlmRequirement(
            goal="数据分析看板",
            must=[Condition(key="platform", value="linux")],
            should=[Condition(key="category", value="BI")],
        )
    )
    runner = _runner(settings, backend, vector, llm)

    events = await _collect(runner, MatchRequest(raw_text="想要一个能部署在 Linux 的数据分析看板"))
    parsed = next(event for event in events if event.name == "parsed").data
    assert parsed["requirement"]["goal"] == "数据分析看板"
    assert parsed["requirement"]["degraded"] is False
    assert backend.created[0]["raw_text"] == "想要一个能部署在 Linux 的数据分析看板"


async def test_match_uses_cached_result(settings: Settings) -> None:
    backend = FakeBackend()
    vector = FakeVector(_hits())
    cache = FakeCache()
    runner = MatchRunner(
        settings=settings,
        backend=backend,  # type: ignore[arg-type]
        vector=vector,  # type: ignore[arg-type]
        embedding=FakeEmbedding(),  # type: ignore[arg-type]
        llm=FakeLlm(),
        cache=cache,  # type: ignore[arg-type]
    )
    request = MatchRequest(raw_text="自建 AI 平台", structured=Requirement(goal="自建 AI 平台"))
    first = await _collect(runner, request)
    assert first[-1].data["cached"] is False

    second = await _collect(
        MatchRunner(
            settings=settings,
            backend=backend,  # type: ignore[arg-type]
            vector=vector,  # type: ignore[arg-type]
            embedding=FakeEmbedding(),  # type: ignore[arg-type]
            llm=FakeLlm(),
            cache=cache,  # type: ignore[arg-type]
        ),
        request,
    )
    assert second[-1].data["cached"] is True
    assert second[0].name == "parsed"


def test_hard_filters_and_condition_states() -> None:
    requirement = Requirement(
        must=[
            Condition(key="platform", value=["Windows", "macOS"]),
            Condition(key="license", value="MIT"),
            Condition(key="min_stars", value=100),
            Condition(key="active_within_days", value=365),
        ]
    )
    filters = collect_hard_filters(requirement)
    assert filters.platforms == ["windows", "macos"]
    assert filters.licenses == ["mit"]
    assert filters.min_stars == 100
    assert filters.active_within_days == 365

    repo = {"platform": "macos", "license": "MIT", "stars": 500, "pushedAt": "2025-01-01T00:00:00"}
    assert evaluate_condition(requirement.must[0], repo, "").status == "hit"
    assert evaluate_condition(requirement.must[1], repo, "").status == "hit"
    assert evaluate_condition(requirement.must[2], repo, "").status == "hit"

    unknown = {"platform": "other", "license": None, "stars": 10, "pushedAt": None}
    assert evaluate_condition(requirement.must[0], unknown, "").status == "miss"
    assert evaluate_condition(requirement.must[1], unknown, "").status == "unknown"
    assert evaluate_condition(requirement.must[3], unknown, "").status == "unknown"


def test_language_and_license_are_normalized_for_filters_and_checks() -> None:
    requirement = Requirement(
        must=[
            Condition(key="language", value="python"),
            Condition(key="license", value="MIT"),
        ]
    )
    filters = collect_hard_filters(requirement)
    # GitHub 的语言名是 "Python"，许可证 spdx_id 常大写；过滤前必须归一化。
    assert filters.languages == ["Python"]
    assert filters.licenses == ["mit"]

    repo = {"language": "Python", "license": "mit"}
    assert evaluate_condition(requirement.must[0], repo, "").status == "hit"
    assert evaluate_condition(requirement.must[1], repo, "").status == "hit"

    vector_filter = build_filter(languages=filters.languages, licenses=filters.licenses)
    assert vector_filter is not None
    conditions = {condition.key: condition for condition in vector_filter.must}
    assert "Python" in conditions["language"].match.any
    assert "mit" in conditions["license"].match.any
    assert "MIT" in conditions["license"].match.any


def test_fit_candidate_breakdown_and_risks() -> None:
    requirement = Requirement(
        goal="AI 平台",
        must=[Condition(key="license", value="MIT")],
    )
    legacy = {
        "fullName": "foo/legacy",
        "license": None,
        "stars": 10,
        "pushedAt": "2018-01-01T00:00:00",
        "archived": True,
        "description": "",
    }
    candidate = fit_candidate(
        repo=legacy,
        semantic=0.4,
        requirement=requirement,
        evidence_hits=[],
        rerank=None,
    )
    assert candidate.breakdown.coverage == 0.5
    assert candidate.breakdown.maintenance == 0.0
    assert any("未声明" in risk for risk in candidate.risks)
    assert any("归档" in risk for risk in candidate.risks)


def test_normalize_requirement_dedupes_and_falls_back_to_raw_text() -> None:
    requirement = Requirement(
        must=[Condition(key="language", value="Go"), Condition(key="Language", value="Go")],
        exclude=["SaaS", "saas"],
    )
    normalized = normalize_requirement(requirement, "  我想找 Go 项目  ")
    assert len(normalized.must) == 1
    assert normalized.exclude == ["SaaS"]
    assert normalized.goal == "我想找 Go 项目"


async def test_parse_requirement_falls_back_when_llm_breaks() -> None:
    class BrokenLlm:
        def with_structured_output(self, schema: type, method: str | None = None) -> Any:
            class Runnable:
                async def ainvoke(self, messages: list[Any], config: Any = None) -> Any:
                    raise RuntimeError("boom")

            return Runnable()

    requirement = await parse_requirement(BrokenLlm(), "需要支持私有部署的笔记工具")
    assert requirement.degraded is True
    assert requirement.goal.startswith("需要支持私有部署")


async def test_match_reports_backend_unavailable_when_recall_breaks(
    settings: Settings,
) -> None:
    class BrokenVector:
        async def search(
            self, vector: list[float], *, limit: int, query_filter: Any = None
        ) -> list[VectorHit]:
            raise RuntimeError("qdrant down")

        async def close(self) -> None:
            return None

    runner = MatchRunner(
        settings=settings,
        backend=FakeBackend(),  # type: ignore[arg-type]
        vector=BrokenVector(),  # type: ignore[arg-type]
        embedding=FakeEmbedding(),  # type: ignore[arg-type]
        llm=FakeLlm(),
        cache=FakeCache(),  # type: ignore[arg-type]
    )
    request = MatchRequest(raw_text="AI 平台", structured=Requirement(goal="AI 平台"))
    with pytest.raises(MatchError) as excinfo:
        async for _ in runner.run(request, user_id=USER_ID):
            pass
    assert excinfo.value.code == "backend_unavailable"


async def test_match_falls_back_to_popular_repos_when_vector_empty(
    settings: Settings,
) -> None:
    class FallbackBackend(FakeBackend):
        async def search_repos(self, **kwargs: Any) -> list[dict[str, Any]]:
            if kwargs.get("q"):
                return []
            return [
                {
                    "fullName": "foo/popular",
                    "description": "站内热门项目",
                    "language": "Python",
                    "license": "mit",
                    "category": "人工智能",
                    "platform": "linux",
                    "stars": 9000,
                    "pushedAt": "2025-09-01T00:00:00",
                    "topics": [],
                }
            ]

    runner = _runner(settings, FallbackBackend(), FakeVector([]), FakeLlm())
    events = await _collect(
        runner,
        MatchRequest(
            raw_text="需要一个知识库",
            structured=Requirement(goal="知识库", keywords=["知识库"]),
        ),
    )
    candidates = [event.data for event in events if event.name == "candidate"]
    assert len(candidates) == 1
    assert candidates[0]["repo"]["fullName"] == "foo/popular"
    # 兜底候选没有向量分数，契合度应明显低于语义召回。
    assert candidates[0]["fit"] < 0.5


async def test_rerank_adjusts_fit(settings: Settings) -> None:
    backend = FakeBackend()
    rerank = RerankResult(
        items=[
            RerankItem(
                full_name="langgenius/dify",
                delta=0.1,
                reasons=["功能覆盖完整"],
                risks=["无法确认中文全文检索"],
            )
        ]
    )
    vector = FakeVector(
        _hits()
        + [
            VectorHit(
                repo_id=3,
                full_name="foo/legacy",
                score=0.8,
                section="README",
                content="旧项目",
                source_url="",
            )
        ]
    )
    runner = _runner(settings, backend, vector, FakeLlm(rerank=rerank))
    events = await _collect(
        runner,
        MatchRequest(
            raw_text="AI 平台",
            structured=Requirement(goal="AI 平台", must=[Condition(key="license", value="MIT")]),
        ),
    )
    candidates = [event.data for event in events if event.name == "candidate"]
    assert len(candidates) == 2  # rerank 需要至少 3 个候选，这里保持未重排
    assert all(candidate["fitted"] is False for candidate in candidates)


async def test_rerank_runs_with_three_candidates(settings: Settings) -> None:
    backend = FakeBackend(
        [
            *FakeBackend().repos,
            {
                "fullName": "foo/next",
                "description": "新一代知识库",
                "language": "Python",
                "license": "MIT",
                "category": "AI",
                "platform": "linux",
                "stars": 800,
                "pushedAt": "2025-08-01T00:00:00",
                "topics": [],
            },
        ]
    )
    rerank = RerankResult(
        items=[
            RerankItem(
                full_name="langgenius/dify",
                delta=0.1,
                reasons=["功能覆盖完整"],
                risks=[],
            )
        ]
    )
    vector = FakeVector(
        _hits()
        + [
            VectorHit(
                repo_id=3,
                full_name="foo/next",
                score=0.7,
                section="README",
                content="新一代知识库，支持 Docker 部署。",
                source_url="",
            )
        ]
    )
    runner = _runner(settings, backend, vector, FakeLlm(rerank=rerank))
    events = await _collect(
        runner,
        MatchRequest(raw_text="AI 平台", structured=Requirement(goal="AI 平台")),
    )
    candidates = [event.data for event in events if event.name == "candidate"]
    assert len(candidates) == 3
    fitted = {item["repo"]["fullName"]: item["fitted"] for item in candidates}
    assert fitted["langgenius/dify"] is True
    assert fitted["foo/next"] is False
