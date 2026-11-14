from types import SimpleNamespace
from typing import Any

import pytest

from app.clients.rerank import RerankError
from app.clients.vector import VectorGroup, VectorHit, build_filter
from app.core.config import Settings
from app.graphs.match_graph import (
    MatchError,
    MatchRunner,
    build_rerank_document,
    build_rerank_query,
    build_semantic_queries,
    collect_hard_filters,
    evaluate_condition,
    fit_candidate,
    fuse_recall_rankings,
    normalize_requirement,
    parse_requirement,
)
from app.schemas.match import (
    Condition,
    LlmRequirement,
    MatchRequest,
    Requirement,
)

USER_ID = 7


class FakeLlm:
    def __init__(
        self,
        *,
        requirement: LlmRequirement | None = None,
        rewrite: str = "data analytics dashboard",
    ) -> None:
        self._requirement = requirement
        self._rewrite = rewrite
        self.calls = 0
        self.rewrites = 0

    def with_structured_output(self, schema: type, method: str | None = None) -> Any:
        outer = self

        class Runnable:
            async def ainvoke(self, messages: list[Any], config: Any = None) -> Any:
                outer.calls += 1
                return outer._requirement or LlmRequirement(goal="兜底目标")

        return Runnable()

    async def ainvoke(self, messages: list[Any], config: Any = None) -> Any:
        self.rewrites += 1
        return SimpleNamespace(content=self._rewrite)


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

    async def embed_queries(self, texts: list[str]) -> list[list[float]]:
        return [[0.1, 0.2, 0.3] for _ in texts]


class FakeGroupVector:
    def __init__(self, groups: list[VectorGroup]) -> None:
        self._groups = groups
        self.calls: list[tuple[int, int, Any]] = []

    async def search_groups(
        self,
        vector: list[float],
        *,
        limit: int,
        group_size: int = 2,
        query_filter: Any = None,
    ) -> list[VectorGroup]:
        self.calls.append((limit, group_size, query_filter))
        return self._groups

    async def search(
        self, vector: list[float], *, limit: int, query_filter: Any = None
    ) -> list[VectorHit]:
        raise AssertionError("分组召回成功时不应回退到 chunk 召回")

    async def close(self) -> None:
        return None


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


def _runner(
    settings: Settings,
    backend: FakeBackend,
    vector: FakeVector,
    llm: Any,
    reranker: Any = None,
) -> MatchRunner:
    return MatchRunner(
        settings=settings,
        backend=backend,  # type: ignore[arg-type]
        vector=vector,  # type: ignore[arg-type]
        embedding=FakeEmbedding(),  # type: ignore[arg-type]
        llm=llm,
        cache=FakeCache(),  # type: ignore[arg-type]
        reranker=reranker,
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
    # 未配置 reranker 时 semantic 保持 0，排序由 fit 决定
    assert candidate["breakdown"]["semantic"] == pytest.approx(0.0)
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
            search_query="data analytics dashboard",
            must=[Condition(key="platform", value="linux")],
            should=[Condition(key="category", value="BI")],
        )
    )
    runner = _runner(settings, backend, vector, llm)

    events = await _collect(runner, MatchRequest(raw_text="想要一个能部署在 Linux 的数据分析看板"))
    parsed = next(event for event in events if event.name == "parsed").data
    assert parsed["requirement"]["degraded"] is False
    # 解析只保留 search_query，不再产出 goal
    assert parsed["requirement"]["goal"] == ""
    assert parsed["requirement"]["search_query"] == "data analytics dashboard"
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


def test_hard_filters_only_keep_platform_and_language() -> None:
    requirement = Requirement(
        must=[
            Condition(key="platform", value=["Windows", "macOS"]),
            Condition(key="language", value="python"),
            Condition(key="license", value="MIT"),
            Condition(key="category", value="RAG"),
            Condition(key="min_stars", value=100),
            Condition(key="active_within_days", value=365),
        ]
    )
    filters = collect_hard_filters(requirement)
    # 只有 platform / language 参与召回过滤，其余一律不放行
    assert filters.platforms == ["windows", "mac"]
    assert filters.languages == ["Python"]

    repo = {
        "platform": "macos",
        "language": "Python",
        "license": "MIT",
        "category": "RAG",
        "stars": 500,
        "pushedAt": "2025-01-01T00:00:00",
    }
    # 未参与过滤的条件仍用于契合度判定
    assert evaluate_condition(requirement.must[1], repo, "").status == "hit"
    assert evaluate_condition(requirement.must[2], repo, "").status == "hit"
    assert evaluate_condition(requirement.must[3], repo, "").status == "hit"
    assert evaluate_condition(requirement.must[4], repo, "").status == "hit"

    unknown = {"platform": "other", "license": None, "stars": 10, "pushedAt": None}
    assert evaluate_condition(requirement.must[0], unknown, "").status == "miss"
    assert evaluate_condition(requirement.must[2], unknown, "").status == "unknown"
    assert evaluate_condition(requirement.must[5], unknown, "").status == "unknown"


def test_non_platform_values_do_not_become_hard_filters() -> None:
    # 模型常把 kubernetes / mysql 填成 platform：不能当硬过滤，否则候选池会被清零
    requirement = Requirement(
        must=[Condition(key="platform", value=["kubernetes", "MySQL"])],
    )
    filters = collect_hard_filters(requirement)
    assert filters.platforms == []
    assert evaluate_condition(requirement.must[0], {"platform": "other"}, "").status == "unknown"


def test_vector_filter_only_contains_language_and_platform() -> None:
    filters = collect_hard_filters(
        Requirement(
            must=[
                Condition(key="language", value="python"),
                Condition(key="platform", value="linux"),
                Condition(key="license", value="MIT"),
                Condition(key="category", value="RAG"),
                Condition(key="min_stars", value=100),
            ]
        )
    )
    vector_filter = build_filter(
        languages=filters.languages or None,
        platforms=filters.platforms or None,
    )
    assert vector_filter is not None
    keys = {condition.key for condition in vector_filter.must}
    assert keys == {"language", "platform"}


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
    )
    assert candidate.breakdown.coverage == 0.5
    assert candidate.breakdown.maintenance == 0.0
    assert any("未声明" in risk for risk in candidate.risks)
    assert any("归档" in risk for risk in candidate.risks)


def test_normalize_requirement_dedupes_without_goal_fallback() -> None:
    requirement = Requirement(
        must=[Condition(key="language", value="Go"), Condition(key="Language", value="Go")],
        exclude=["SaaS", "saas"],
    )
    normalized = normalize_requirement(requirement, "  我想找 Go 项目  ")
    assert len(normalized.must) == 1
    assert normalized.exclude == ["SaaS"]
    # 不再用原文兜底 goal，检索统一走 search_query
    assert normalized.goal == ""


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


async def test_match_returns_empty_when_recall_is_empty(settings: Settings) -> None:
    runner = _runner(settings, FakeBackend(), FakeVector([]), FakeLlm())
    events = await _collect(
        runner,
        MatchRequest(
            raw_text="需要一个知识库",
            structured=Requirement(goal="知识库", keywords=["知识库"]),
        ),
    )
    candidates = [event.data for event in events if event.name == "candidate"]
    # 不再用站内热门兜底：召回为空就返回空结果
    assert candidates == []
    assert events[-1].data["total"] == 0


async def test_match_ranks_by_fit_without_llm_rerank(settings: Settings) -> None:
    backend = FakeBackend()
    vector = FakeVector(_hits())
    runner = _runner(settings, backend, vector, FakeLlm())
    events = await _collect(
        runner,
        MatchRequest(
            raw_text="AI 平台",
            structured=Requirement(goal="AI 平台", must=[Condition(key="license", value="MIT")]),
        ),
    )
    # 结构体里不再有 LLM 重排字段：排序完全由召回 + 契合度决定
    parsed = next(event for event in events if event.name == "parsed").data
    assert "fitted" not in parsed["requirement"]

    candidates = [event.data for event in events if event.name == "candidate"]
    assert candidates
    assert all("fitted" not in candidate for candidate in candidates)
    assert "rerank_scored" in runner.recall_stats


def test_build_semantic_queries_returns_single_english_query() -> None:
    requirement = Requirement(
        goal="私有部署知识库",
        search_query="self-hosted knowledge base RAG",
        keywords=["knowledge base", "dify"],
        must=[Condition(key="license", value="MIT")],
    )
    queries = build_semantic_queries(requirement)
    assert queries == ["self-hosted knowledge base RAG"]
    assert all(len(query) <= 200 for query in queries)


def test_build_semantic_queries_skips_non_english_query() -> None:
    # 无英文内容的 query 不进入向量通道；英文改写由 runner 在召回前完成
    assert build_semantic_queries(Requirement(goal="知识库")) == []
    assert build_semantic_queries(
        Requirement(goal="知识库", search_query="纯中文描述")
    ) == []


def test_fuse_recall_rankings_equal_weight_and_limit() -> None:
    # 两路都命中的 c 排第一；单路各自的第 1 名紧随其后
    assert fuse_recall_rankings(["a", "b", "c"], ["c", "d"], limit=10) == [
        "c",
        "a",
        "b",
        "d",
    ]
    # 两路权重各 50%：只出现在单路第 1 名时得分完全一致
    assert fuse_recall_rankings(["x"], [], limit=1) == ["x"]
    assert fuse_recall_rankings([], ["x"], limit=1) == ["x"]
    # 只保留前 limit 个仓库进入精排
    vector_ranking = [f"repo-{index}" for index in range(100)]
    assert len(fuse_recall_rankings(vector_ranking, [], limit=60)) == 60


async def test_keyword_only_repo_enters_rrf_pool(settings: Settings) -> None:
    class KeywordBackend(FakeBackend):
        async def search_repos(self, **kwargs: Any) -> list[dict[str, Any]]:
            return [
                {
                    "fullName": "foo/keyword-only",
                    "description": "keyword only repo",
                    "language": "Python",
                    "license": "MIT",
                    "category": "AI",
                    "platform": "linux",
                    "stars": 100,
                    "pushedAt": "2025-08-01T00:00:00",
                    "topics": [],
                }
            ]

    backend = KeywordBackend(
        [
            *FakeBackend().repos,
            {
                "fullName": "foo/keyword-only",
                "description": "keyword only repo",
                "language": "Python",
                "license": "MIT",
                "category": "AI",
                "platform": "linux",
                "stars": 100,
                "pushedAt": "2025-08-01T00:00:00",
                "topics": [],
            },
        ]
    )
    vector = FakeGroupVector(
        [
            VectorGroup(
                repo_id=1,
                full_name="langgenius/dify",
                best_score=0.81,
                hits=[],
            )
        ]
    )
    runner = _runner(settings, backend, vector, FakeLlm())  # type: ignore[arg-type]
    events = await _collect(
        runner,
        MatchRequest(
            raw_text="AI platform",
            structured=Requirement(
                goal="AI platform",
                search_query="AI platform",
                keywords=["keyword-only"],
            ),
        ),
    )

    pool = runner.recall_stats["pool_names"]
    assert "foo/keyword-only" in pool
    assert "langgenius/dify" in pool
    assert len([event for event in events if event.name == "candidate"]) >= 1


async def test_group_recall_returns_repo_level_pool(settings: Settings) -> None:
    groups = [
        VectorGroup(
            repo_id=1,
            full_name="langgenius/dify",
            best_score=0.81,
            hits=[
                VectorHit(
                    repo_id=1,
                    full_name="langgenius/dify",
                    score=0.81,
                    section="Features",
                    content="LLM 应用编排与 Agent 工作流。",
                    source_url="",
                )
            ],
        ),
        VectorGroup(
            repo_id=3,
            full_name="foo/next",
            best_score=0.72,
            hits=[
                VectorHit(
                    repo_id=3,
                    full_name="foo/next",
                    score=0.72,
                    section="README",
                    content="知识库，支持 Docker。",
                    source_url="",
                )
            ],
        ),
    ]
    vector = FakeGroupVector(groups)
    backend = FakeBackend(
        [
            *FakeBackend().repos,
            {
                "fullName": "foo/next",
                "description": "新一代知识库",
                "language": "TypeScript",
                "license": "MIT",
                "category": "AI",
                "platform": "linux",
                "stars": 800,
                "pushedAt": "2025-08-01T00:00:00",
                "topics": [],
            },
        ]
    )
    runner = _runner(settings, backend, vector, FakeLlm())  # type: ignore[arg-type]
    events = await _collect(
        runner,
        MatchRequest(raw_text="AI 平台", structured=Requirement(goal="AI 平台")),
    )

    assert vector.calls, "应调用分组召回"
    limit, group_size, _ = vector.calls[0]
    assert limit == settings.match_recall_limit
    assert group_size == settings.match_group_size
    # limit 语义是仓库数：只返回 2 个仓库，不会因为一个仓库多块而膨胀
    assert runner.recall_stats["vector_repos"] == 2
    # 英文单路召回：每次查询只走一条向量通道
    assert len(vector.calls) == 1
    assert runner.recall_stats["vector_groups"] == 2

    candidates = [event.data for event in events if event.name == "candidate"]
    assert {item["repo"]["fullName"] for item in candidates} == {
        "langgenius/dify",
        "foo/next",
    }


def test_cache_key_carries_pipeline_version(settings: Settings) -> None:
    runner = _runner(settings, FakeBackend(), FakeVector([]), FakeLlm())
    request = MatchRequest(raw_text="x", structured=Requirement(goal="x"))
    key = runner._cache_key(request, USER_ID, 6)
    assert key.startswith(f"match:{settings.match_cache_version}:{USER_ID}:")

    newer = Settings(match_cache_version="v-next")
    other = _runner(newer, FakeBackend(), FakeVector([]), FakeLlm())
    assert other._cache_key(request, USER_ID, 6) != key


def test_rerank_query_and_document_builders() -> None:
    requirement = Requirement(goal="知识库", search_query="self-hosted RAG")
    assert build_rerank_query(requirement, "原文") == "self-hosted RAG"
    # 不再回退 goal：无英文检索句时只用英文原文，仍无英文则不进入交叉编码器
    assert (
        build_rerank_query(Requirement(goal="知识库"), "plain english text")
        == "plain english text"
    )
    assert build_rerank_query(Requirement(goal="纯中文"), "纯中文原文") == ""

    document = build_rerank_document(
        {"description": "开源知识库", "topics": ["rag", "search"]},
        [
            VectorHit(
                repo_id=1,
                full_name="a/b",
                score=0.9,
                section="Features",
                content="支持中文全文检索与 Docker 部署。",
                source_url="",
            )
        ],
    )
    assert "开源知识库" in document
    assert "rag" in document
    assert "Docker 部署" in document


class FakeReranker:
    enabled = True

    def __init__(self, scores: list[float]) -> None:
        self._scores = scores
        self.queries: list[str] = []
        self.documents: list[str] = []

    async def score(self, query: str, documents: list[str]) -> list[float]:
        self.queries.append(query)
        self.documents = documents
        return self._scores


class BrokenReranker:
    enabled = True

    async def score(self, query: str, documents: list[str]) -> list[float]:
        raise RerankError("boom")


def _rerank_fixture() -> tuple[FakeBackend, FakeGroupVector, list[VectorGroup]]:
    groups = [
        VectorGroup(
            repo_id=1,
            full_name="langgenius/dify",
            best_score=0.81,
            hits=[
                VectorHit(
                    repo_id=1,
                    full_name="langgenius/dify",
                    score=0.81,
                    section="Features",
                    content="LLM 应用编排与 Agent 工作流。",
                    source_url="",
                )
            ],
        ),
        VectorGroup(
            repo_id=3,
            full_name="foo/next",
            best_score=0.72,
            hits=[
                VectorHit(
                    repo_id=3,
                    full_name="foo/next",
                    score=0.72,
                    section="README",
                    content="知识库，支持 Docker。",
                    source_url="",
                )
            ],
        ),
    ]
    backend = FakeBackend(
        [
            *FakeBackend().repos,
            {
                "fullName": "foo/next",
                "description": "新一代知识库",
                "language": "TypeScript",
                "license": "MIT",
                "category": "AI",
                "platform": "linux",
                "stars": 800,
                "pushedAt": "2025-08-01T00:00:00",
                "topics": [],
            },
        ]
    )
    return backend, FakeGroupVector(groups), groups


async def test_rerank_sets_semantic_score(settings: Settings) -> None:
    backend, vector, _ = _rerank_fixture()
    reranker = FakeReranker([0.1, 0.9])
    runner = _runner(settings, backend, vector, FakeLlm(), reranker=reranker)  # type: ignore[arg-type]
    events = await _collect(
        runner,
        MatchRequest(
            raw_text="AI 平台",
            structured=Requirement(goal="AI 平台", search_query="AI platform"),
        ),
    )

    # normalize_search_query 会清掉 platform 这类泛词，因此只保留 AI
    assert reranker.queries == ["AI"]
    assert runner.recall_stats["rerank_scored"] == 2
    assert runner.recall_stats["rerank_failed"] is False

    candidates = {
        event.data["repo"]["fullName"]: event.data
        for event in events
        if event.name == "candidate"
    }
    # 取消 RRF 后 semantic 直接等于 rerank 分数
    assert candidates["foo/next"]["breakdown"]["semantic"] == pytest.approx(0.9)
    assert candidates["langgenius/dify"]["breakdown"]["semantic"] == pytest.approx(0.1)


async def test_rerank_failure_keeps_zero_semantic(settings: Settings) -> None:
    backend, vector, _ = _rerank_fixture()
    runner = _runner(settings, backend, vector, FakeLlm(), reranker=BrokenReranker())  # type: ignore[arg-type]
    events = await _collect(
        runner,
        MatchRequest(raw_text="AI 平台", structured=Requirement(goal="AI 平台")),
    )

    assert runner.recall_stats["rerank_failed"] is True
    assert runner.recall_stats["rerank_scored"] == 0

    candidates = {
        event.data["repo"]["fullName"]: event.data
        for event in events
        if event.name == "candidate"
    }
    # 接口失败时没有可用的语义分，全部回落到 fit 排序
    assert all(
        candidate["breakdown"]["semantic"] == pytest.approx(0.0)
        for candidate in candidates.values()
    )

