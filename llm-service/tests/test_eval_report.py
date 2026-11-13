from pathlib import Path

from app.core.config import Settings
from tests.eval.judge import CaseJudgement
from tests.eval.run_eval import EvalCase, EvalResult, render_report


def test_report_uses_configured_chat_model() -> None:
    settings = Settings(environment="test", llm_chat_model="test-chat-model")
    case = EvalCase(case_id="c1", text="需要一个知识库", expected=["a/b"])
    result = EvalResult(
        case=case,
        retrieved=["a/b"],
        hits=["a/b"],
        recall=1.0,
        reciprocal_rank=1.0,
        took_ms=12,
    )

    report = render_report([result], 10, settings, Path("dataset.jsonl"))

    assert "test-chat-model" in report
    assert "成功用例 | 1 / 1" in report
    assert "平均 recall@10 | 1.000" in report
    # 未启用判定时不能伪造相关性指标
    assert "判定成功用例 | 0 / 1" in report
    assert "至少 1 个相关（match） | 0 / 0" in report


def test_report_prioritizes_judge_over_label_match() -> None:
    settings = Settings(environment="test", llm_chat_model="judge-model")
    case = EvalCase(case_id="c1", text="需要一个知识库", expected=["a/b"])
    result = EvalResult(
        case=case,
        retrieved=["x/y", "a/b"],
        hits=["a/b"],
        recall=1.0,
        reciprocal_rank=0.5,
        took_ms=12,
        judgement=CaseJudgement(
            verdicts={"x/y": "match", "a/b": "partial"},
            reasons={"x/y": "满足知识库与自托管", "a/b": "缺少全文检索"},
        ),
    )

    report = render_report([result], 10, settings, Path("dataset.jsonl"))

    assert "至少 1 个相关（match） | 1 / 1" in report
    assert "平均严谨相关率@10（match / 已判定候选） | 0.500" in report
    assert "| 1 | 1 | 0 | 1 | a/b | 12 |" in report
    assert "- [match] x/y：满足知识库与自托管" in report

