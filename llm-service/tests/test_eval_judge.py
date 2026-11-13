from pathlib import Path
from typing import Any

import pytest

from tests.eval.judge import (
    JudgeResult,
    JudgeVerdict,
    RelevanceJudge,
    build_payload,
    first_relevant_rank,
    payload_key,
    summarize,
)


def _candidate(name: str, *, description: str = "知识库", evidence: str = "支持自托管") -> dict:
    return {
        "repo": {"fullName": name, "description": description, "stars": 100, "topics": ["kb"]},
        "evidence": [{"section": "README", "snippet": evidence}],
        "fit": 0.9,
        "reasons": ["内部排序理由"],
        "risks": ["内部风险"],
    }


def test_summarize_counts_verdicts_and_unknown() -> None:
    verdicts = {"a/b": "match", "c/d": "partial", "e/f": "mismatch"}
    stats = summarize(verdicts, ["a/b", "c/d", "e/f", "g/h"])
    assert (stats.relevant, stats.partial, stats.mismatch, stats.unknown) == (1, 1, 1, 1)
    assert stats.judged == 3
    assert stats.relevant_rate == pytest.approx(1 / 3)
    assert stats.partial_rate == pytest.approx(1 / 3)


def test_first_relevant_rank_skips_partial() -> None:
    verdicts = {"a/b": "partial", "c/d": "match"}
    assert first_relevant_rank(verdicts, ["a/b", "c/d"]) == 2
    assert first_relevant_rank({"a/b": "partial"}, ["a/b"]) is None


def test_payload_excludes_internal_ranking_fields() -> None:
    payload = build_payload(
        case_text="需要一个知识库",
        requirement={"goal": "知识库", "must": [{"key": "license", "value": "MIT"}]},
        candidates=[_candidate("a/b")],
    )
    candidate = payload["candidates"][0]
    assert candidate["fullName"] == "a/b"
    assert candidate["evidence"] == ["支持自托管"]
    # fit / reasons / risks 属于本系统输出，不能喂给判定模型
    assert "fit" not in candidate
    assert "reasons" not in candidate
    assert "risks" not in candidate
    # 默认不把同源结构化需求带进判定
    assert "requirement" not in payload


def test_payload_can_include_requirement_and_sorts_candidates() -> None:
    payload = build_payload(
        case_text="需要一个知识库",
        requirement={"goal": "知识库"},
        candidates=[_candidate("z/z"), _candidate("a/b")],
        include_requirement=True,
    )
    assert payload["requirement"] == {"goal": "知识库"}
    assert [item["fullName"] for item in payload["candidates"]] == ["a/b", "z/z"]


def test_payload_key_is_stable_regardless_of_key_order() -> None:
    first = payload_key({"a": 1, "b": [1, 2]})
    second = payload_key({"b": [1, 2], "a": 1})
    assert first == second


class FakeJudgeLlm:
    def __init__(self, verdict: str = "match") -> None:
        self.calls = 0
        self._verdict = verdict

    def with_structured_output(self, schema: type, method: str | None = None) -> Any:
        outer = self

        class Runnable:
            async def ainvoke(self, messages: list[Any], config: Any = None) -> Any:
                outer.calls += 1
                return JudgeResult(
                    items=[
                        JudgeVerdict(full_name="a/b", verdict=outer._verdict, reason="满足需求")
                    ]
                )

        return Runnable()


async def test_judge_caches_by_payload(tmp_path: Path) -> None:
    llm = FakeJudgeLlm()
    cache_path = tmp_path / "judge-cache.json"
    judge = RelevanceJudge(llm, cache_path=cache_path)
    candidates = [_candidate("a/b")]

    first = await judge.judge(case_text="知识库", requirement=None, candidates=candidates)
    second = await judge.judge(case_text="知识库", requirement=None, candidates=candidates)

    assert first.verdicts == {"a/b": "match"}
    assert second.verdicts == {"a/b": "match"}
    assert llm.calls == 1
    assert cache_path.exists()

    # 新实例读同一份缓存，仍然不重复调用模型
    replay = RelevanceJudge(llm, cache_path=cache_path)
    third = await replay.judge(case_text="知识库", requirement=None, candidates=candidates)
    assert third.verdicts == {"a/b": "match"}
    assert llm.calls == 1


async def test_judge_returns_error_when_llm_fails(tmp_path: Path) -> None:
    class BrokenLlm:
        def with_structured_output(self, schema: type, method: str | None = None) -> Any:
            class Runnable:
                async def ainvoke(self, messages: list[Any], config: Any = None) -> Any:
                    raise RuntimeError("boom")

            return Runnable()

    judge = RelevanceJudge(BrokenLlm(), cache_path=tmp_path / "cache.json")
    result = await judge.judge(
        case_text="知识库", requirement=None, candidates=[_candidate("a/b")]
    )
    assert result.error is not None
    assert result.verdicts == {}
