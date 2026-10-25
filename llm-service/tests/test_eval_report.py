from pathlib import Path

from app.core.config import Settings
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
