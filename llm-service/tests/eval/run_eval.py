"""M4 语义匹配离线评测：recall@K + 人工核对表。

用法（需 backend、Qdrant、Redis、LLM 均可用，且索引已建好）：

    cd llm-service
    python -m tests.eval.run_eval
    python -m tests.eval.run_eval --limit 10 --report ../doc/eval/baseline.md

注意：脚本会为每条需求创建一条 ideas 记录（userId=0），便于复现与追踪。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from app.clients.backend import BackendClient
from app.clients.llm import build_chat_model
from app.clients.redis import CacheClient
from app.clients.vector import VectorStore
from app.core.config import get_settings
from app.graphs.match_graph import MatchRunner
from app.schemas.match import MatchRequest
from app.services.embedding import get_embedding_service

WORKER_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = WORKER_DIR.parent


@dataclass
class EvalCase:
    case_id: str
    text: str
    expected: list[str]
    notes: str = ""


@dataclass
class EvalResult:
    case: EvalCase
    retrieved: list[str]
    hits: list[str]
    recall: float
    reciprocal_rank: float
    took_ms: int
    error: str | None = None


def load_dataset(path: Path) -> list[EvalCase]:
    cases: list[EvalCase] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            raw = json.loads(line)
            cases.append(
                EvalCase(
                    case_id=str(raw["id"]),
                    text=str(raw["text"]),
                    expected=[str(item) for item in raw.get("expected", [])],
                    notes=str(raw.get("notes", "")),
                )
            )
    if not cases:
        raise SystemExit(f"数据集为空：{path}")
    for case in cases:
        if not case.expected:
            raise SystemExit(f"用例 {case.case_id} 缺少 expected")
    return cases


async def evaluate(case: EvalCase, limit: int) -> EvalResult:
    settings = get_settings()
    backend = BackendClient(settings)
    vector = VectorStore(settings)
    cache = CacheClient(settings)
    runner = MatchRunner(
        settings=settings,
        backend=backend,
        vector=vector,
        embedding=get_embedding_service(settings),
        llm=build_chat_model(settings),
        cache=cache,
    )

    started = time.perf_counter()
    names: list[str] = []
    error: str | None = None
    try:
        async for event in runner.run(MatchRequest(raw_text=case.text, limit=limit), user_id=0):
            if event.name == "candidate":
                names.append(str(event.data["repo"]["fullName"]))
            elif event.name == "error":
                error = str(event.data.get("message") or event.data.get("code"))
            elif event.name == "done" and error is None:
                break
    except Exception as exc:  # noqa: BLE001 - 评测需要记录所有失败
        error = f"{type(exc).__name__}: {exc}"
    finally:
        await vector.close()
        await cache.close()

    expected = set(case.expected)
    hits = [name for name in names if name in expected]
    recall = len(hits) / len(expected) if expected else 0.0
    reciprocal_rank = 0.0
    for index, name in enumerate(names, start=1):
        if name in expected:
            reciprocal_rank = 1.0 / index
            break

    return EvalResult(
        case=case,
        retrieved=names,
        hits=hits,
        recall=recall,
        reciprocal_rank=reciprocal_rank,
        took_ms=int((time.perf_counter() - started) * 1000),
        error=error,
    )


async def run(dataset: Path, limit: int, report: Path, max_cases: int | None) -> None:
    cases = load_dataset(dataset)
    if max_cases:
        cases = cases[:max_cases]

    settings = get_settings()
    results: list[EvalResult] = []
    for index, case in enumerate(cases, start=1):
        print(f"[{index}/{len(cases)}] {case.case_id}: {case.text[:60]}")
        result = await evaluate(case, limit)
        results.append(result)
        status = "ERROR" if result.error else f"recall={result.recall:.2f}"
        print(f"    {status}, hits={result.hits}, took={result.took_ms}ms")

    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(
        render_report(results, limit, settings, dataset),
        encoding="utf-8",
    )
    print(f"report written to {report}")


def render_report(results: list[EvalResult], limit: int, settings: Any, dataset: Path) -> str:
    evaluated = [result for result in results if not result.error]
    average_recall = (
        sum(result.recall for result in evaluated) / len(evaluated) if evaluated else 0.0
    )
    average_mrr = (
        sum(result.reciprocal_rank for result in evaluated) / len(evaluated) if evaluated else 0.0
    )
    hit_cases = sum(1 for result in evaluated if result.hits)
    errors = [result for result in results if result.error]

    lines = [
        "# 语义匹配基线（M4）",
        "",
        f"- 生成时间：{datetime.now().astimezone().isoformat(timespec='seconds')}",
        f"- 数据集：`{dataset}`（{len(results)} 条）",
        f"- 模型：`{settings.llm_chat_model}`；embedding：`{settings.llm_embedding_model}`"
        f"（{settings.embedding_provider}，{settings.llm_embedding_dim} 维）",
        f"- 指标：recall@{limit}（候选命中 / 标注相关仓库）、MRR@{limit}",
        "",
        "## 汇总",
        "",
        "| 指标 | 数值 |",
        "| --- | --- |",
        f"| 成功用例 | {len(evaluated)} / {len(results)} |",
        f"| 至少命中 1 个 | {hit_cases} / {len(evaluated) if evaluated else 0} |",
        f"| 平均 recall@{limit} | {average_recall:.3f} |",
        f"| 平均 MRR@{limit} | {average_mrr:.3f} |",
        "",
        "## 逐条结果",
        "",
        "| 用例 | 描述 | 命中 | recall | RR | 耗时(ms) | 备注 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for result in results:
        text = result.case.text.replace("|", " ").replace("\n", " ")[:60]
        hits = ", ".join(result.hits) or ("ERROR" if result.error else "—")
        note = result.error or result.case.notes
        lines.append(
            f"| {result.case.case_id} | {text} | {hits} | {result.recall:.2f} | "
            f"{result.reciprocal_rank:.2f} | {result.took_ms} | {note} |"
        )

    if errors:
        lines.extend(["", "## 失败用例", ""])
        for result in errors:
            lines.append(f"- `{result.case.case_id}`：{result.error}")

    lines.extend(
        [
            "",
            "## 解读",
            "",
            "- recall 低优先检查：索引覆盖是否完整、README 分块是否切碎了关键功能描述、"
            "硬条件是否过严。",
            "- 候选顺序问题看 MRR；顺序差但召回流好时，再调重排提示词与语义/覆盖权重。",
            "- 本报告来自真实服务运行结果；任何未实际运行的指标都应留空或标注，不得估算。",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="M4 语义匹配评测")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=WORKER_DIR / "tests" / "eval" / "dataset.jsonl",
        help="JSONL 数据集路径",
    )
    parser.add_argument("--limit", type=int, default=10, help="每个需求取前 K 个候选")
    parser.add_argument(
        "--report",
        type=Path,
        default=REPO_ROOT / "doc" / "eval" / "baseline.md",
        help="Markdown 报告输出路径",
    )
    parser.add_argument("--max-cases", type=int, default=None, help="只跑前 N 条，便于冒烟")
    args = parser.parse_args()

    try:
        asyncio.run(run(args.dataset, args.limit, args.report, args.max_cases))
    except KeyboardInterrupt:
        raise SystemExit(130) from None


if __name__ == "__main__":
    main()
