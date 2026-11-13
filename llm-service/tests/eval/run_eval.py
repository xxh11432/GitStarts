"""M4 语义匹配召回评测：LLM 相关性判定为主口径，标注精确匹配为参考。

用法（需 backend、Qdrant、Redis、LLM 均可用，且索引已建好）：

    cd llm-service
    python -m tests.eval.run_eval
    python -m tests.eval.run_eval --limit 10 --report ../doc/eval/baseline-p0.md
    python -m tests.eval.run_eval --no-judge   # 只跑标注精确匹配

判定口径：
- 主口径：LLM-as-Judge 判断候选是否满足用户需求（match / partial / mismatch）
- 参考口径：候选 fullName 是否命中 dataset.jsonl 的 expected

注意：脚本会为每条需求创建一条 ideas 记录（userId=0），便于复现与追踪。
判定结果按请求内容哈希缓存到 tests/eval/.judge-cache.json，重跑复用、不重复计费。
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
from app.clients.rerank import RerankClient
from app.clients.vector import VectorStore
from app.core.config import get_settings
from app.graphs.match_graph import MatchRunner
from app.schemas.match import MatchRequest
from app.services.embedding import get_embedding_service
from tests.eval.judge import (
    CaseJudgement,
    RelevanceJudge,
    first_relevant_rank,
    summarize,
)

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
    stats: dict[str, Any] | None = None
    pool_hits: list[str] | None = None
    pool_recall: float = 0.0
    judgement: CaseJudgement | None = None
    judge_ms: int = 0


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


async def evaluate(
    case: EvalCase,
    limit: int,
    *,
    use_cache: bool = True,
    judge: RelevanceJudge | None = None,
) -> EvalResult:
    settings = get_settings()
    backend = BackendClient(settings)
    vector = VectorStore(settings)
    cache = CacheClient(settings) if use_cache else None
    runner = MatchRunner(
        settings=settings,
        backend=backend,
        vector=vector,
        embedding=get_embedding_service(settings),
        llm=build_chat_model(settings),
        cache=cache,
        reranker=RerankClient(settings),
    )

    started = time.perf_counter()
    names: list[str] = []
    candidates: list[dict[str, Any]] = []
    requirement: dict[str, Any] | None = None
    error: str | None = None
    try:
        async for event in runner.run(MatchRequest(raw_text=case.text, limit=limit), user_id=0):
            if event.name == "candidate":
                names.append(str(event.data["repo"]["fullName"]))
                candidates.append(dict(event.data))
            elif event.name == "parsed":
                requirement = event.data.get("requirement")
            elif event.name == "error":
                error = str(event.data.get("message") or event.data.get("code"))
            elif event.name == "done" and error is None:
                break
    except Exception as exc:  # noqa: BLE001 - 评测需要记录所有失败
        error = f"{type(exc).__name__}: {exc}"
    finally:
        await vector.close()
        if cache is not None:
            await cache.close()

    took_ms = int((time.perf_counter() - started) * 1000)

    judgement: CaseJudgement | None = None
    judge_ms = 0
    if judge is not None and candidates:
        judge_started = time.perf_counter()
        judgement = await judge.judge(
            case_text=case.text, requirement=requirement, candidates=candidates
        )
        judge_ms = int((time.perf_counter() - judge_started) * 1000)

    expected = set(case.expected)
    hits = [name for name in names if name in expected]
    recall = len(hits) / len(expected) if expected else 0.0
    pool_names = set((runner.recall_stats or {}).get("pool_names") or [])
    pool_hits = [name for name in case.expected if name in pool_names]
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
        took_ms=took_ms,
        error=error,
        stats=runner.recall_stats or None,
        pool_hits=pool_hits,
        pool_recall=len(pool_hits) / len(expected) if expected else 0.0,
        judgement=judgement,
        judge_ms=judge_ms,
    )


async def run(
    dataset: Path,
    limit: int,
    report: Path,
    max_cases: int | None,
    *,
    use_cache: bool = True,
    judge: RelevanceJudge | None = None,
) -> None:
    cases = load_dataset(dataset)
    if max_cases:
        cases = cases[:max_cases]

    settings = get_settings()
    results: list[EvalResult] = []
    for index, case in enumerate(cases, start=1):
        print(f"[{index}/{len(cases)}] {case.case_id}: {case.text[:60]}")
        result = await evaluate(case, limit, use_cache=use_cache, judge=judge)
        results.append(result)
        status = "ERROR" if result.error else f"recall={result.recall:.2f}"
        stats = summarize(
            (result.judgement.verdicts if result.judgement else {}), result.retrieved
        )
        print(
            f"    {status}, hits={result.hits}, pool_recall={result.pool_recall:.2f}, "
            f"judge match/partial/mismatch={stats.relevant}/{stats.partial}/{stats.mismatch}, "
            f"took={result.took_ms}ms judge={result.judge_ms}ms"
        )

    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(
        render_report(results, limit, settings, dataset),
        encoding="utf-8",
    )
    print(f"report written to {report}")


def render_report(results: list[EvalResult], limit: int, settings: Any, dataset: Path) -> str:
    evaluated = [result for result in results if not result.error]
    errors = [result for result in results if result.error]

    judged = [
        result
        for result in evaluated
        if result.judgement is not None and result.judgement.error is None
    ]
    judge_errors = [
        result
        for result in evaluated
        if result.judgement is not None and result.judgement.error is not None
    ]

    total_relevant = total_partial = total_mismatch = total_unknown = 0
    judge_rr_sum = 0.0
    match_cases = 0
    any_cases = 0
    for result in judged:
        verdicts = result.judgement.verdicts if result.judgement else {}
        stats = summarize(verdicts, result.retrieved)
        total_relevant += stats.relevant
        total_partial += stats.partial
        total_mismatch += stats.mismatch
        total_unknown += stats.unknown
        if stats.relevant:
            match_cases += 1
        if stats.relevant or stats.partial:
            any_cases += 1
        rank = first_relevant_rank(verdicts, result.retrieved)
        judge_rr_sum += 1.0 / rank if rank else 0.0

    judged_count = len(judged)
    total_judged = total_relevant + total_partial + total_mismatch
    relevant_rate = total_relevant / total_judged if total_judged else 0.0
    partial_rate = total_partial / total_judged if total_judged else 0.0
    average_judge_rr = judge_rr_sum / judged_count if judged_count else 0.0

    average_recall = (
        sum(result.recall for result in evaluated) / len(evaluated) if evaluated else 0.0
    )
    average_mrr = (
        sum(result.reciprocal_rank for result in evaluated) / len(evaluated) if evaluated else 0.0
    )
    hit_cases = sum(1 for result in evaluated if result.hits)
    pool_sizes = [
        int((result.stats or {}).get("pool_size") or 0)
        for result in evaluated
        if result.stats
    ]
    average_pool = sum(pool_sizes) / len(pool_sizes) if pool_sizes else 0.0
    average_pool_recall = (
        sum(result.pool_recall for result in evaluated) / len(evaluated) if evaluated else 0.0
    )
    pool_hit_cases = sum(1 for result in evaluated if result.pool_hits)

    lines = [
        "# 语义匹配召回评测（M4）",
        "",
        f"- 生成时间：{datetime.now().astimezone().isoformat(timespec='seconds')}",
        f"- 数据集：`{dataset}`（{len(results)} 条）",
        f"- 模型：`{settings.llm_chat_model}`；embedding：`{settings.llm_embedding_model}`"
        f"（{settings.embedding_provider}，{settings.llm_embedding_dim} 维）",
        "- 主口径：LLM-as-Judge，判断候选是否满足用户需求"
        "（match / partial / mismatch，prompt 版本 v1）",
        f"- 参考口径：标注 fullName 精确匹配（recall@{limit} / MRR@{limit}）",
        "",
        "## 汇总（相关性判定为主口径）",
        "",
        "| 指标 | 数值 |",
        "| --- | --- |",
        f"| 成功用例 | {len(evaluated)} / {len(results)} |",
        f"| 判定成功用例 | {judged_count} / {len(evaluated) if evaluated else 0} |",
        f"| 至少 1 个相关（match） | {match_cases} / {judged_count if judged_count else 0} |",
        f"| 至少 1 个相关或部分相关 | {any_cases} / {judged_count if judged_count else 0} |",
        f"| 平均严谨相关率@{limit}（match / 已判定候选） | {relevant_rate:.3f} |",
        f"| 平均部分相关率@{limit} | {partial_rate:.3f} |",
        f"| 平均首个相关排名（MRR） | {average_judge_rr:.3f} |",
        f"| 已判定候选数（match/partial/mismatch/未判定） | "
        f"{total_relevant}/{total_partial}/{total_mismatch}/{total_unknown} |",
        "",
        "## 参考：标注命中",
        "",
        "| 指标 | 数值 |",
        "| --- | --- |",
        f"| 至少命中 1 个标注仓库 | {hit_cases} / {len(evaluated) if evaluated else 0} |",
        f"| 平均 recall@{limit} | {average_recall:.3f} |",
        f"| 平均 MRR@{limit} | {average_mrr:.3f} |",
        f"| 平均候选池 recall（进池即算命中） | {average_pool_recall:.3f} |",
        f"| 候选池至少命中 1 个标注仓库 | "
        f"{pool_hit_cases} / {len(evaluated) if evaluated else 0} |",
        f"| 平均候选池 | {average_pool:.1f} |",
        "",
        "## 逐条结果",
        "",
        "| 用例 | 描述 | 相关 | 部分 | 不相关 | 首个相关 | 标注命中 | 耗时(ms) |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for result in results:
        text = result.case.text.replace("|", " ").replace("\n", " ")[:60]
        hits = ", ".join(result.hits) or "—"
        if result.judgement is None or result.judgement.error is not None:
            lines.append(
                f"| {result.case.case_id} | {text} | — | — | — | — | {hits} | "
                f"{result.took_ms} |"
            )
            continue
        stats = summarize(result.judgement.verdicts, result.retrieved)
        rank = first_relevant_rank(result.judgement.verdicts, result.retrieved)
        lines.append(
            f"| {result.case.case_id} | {text} | {stats.relevant} | {stats.partial} | "
            f"{stats.mismatch} | {rank if rank else '—'} | {hits} | {result.took_ms} |"
        )

    if errors:
        lines.extend(["", "## 失败用例", ""])
        for result in errors:
            lines.append(f"- `{result.case.case_id}`：{result.error}")

    if judge_errors:
        lines.extend(["", "## 判定失败用例", ""])
        for result in judge_errors:
            error = result.judgement.error if result.judgement else "unknown"
            lines.append(f"- `{result.case.case_id}`：{error}")

    details = [result for result in judged if result.judgement]
    if details:
        lines.extend(
            [
                "",
                "## 判定明细",
                "",
                "> 理由由模型生成，仅用于审计召回质量；争议项需人工复核。",
                "",
            ]
        )
        for result in details:
            judgement = result.judgement
            assert judgement is not None
            stats = summarize(judgement.verdicts, result.retrieved)
            lines.append(
                f"### {result.case.case_id}"
                f"（match {stats.relevant} / partial {stats.partial} / mismatch {stats.mismatch}）"
            )
            for name in result.retrieved:
                verdict = judgement.verdicts.get(name, "unknown")
                reason = judgement.reasons.get(name, "")
                lines.append(f"- [{verdict}] {name}：{reason or '—'}")
            lines.append("")

    diagnostics = [result for result in results if result.stats]
    if diagnostics:
        lines.extend(
            [
                "",
                "## 候选池诊断",
                "",
                "| 用例 | 分组召回仓库 | 向量仓库 | 关键词仓库 | 候选池 | 池命中 | 查询数 |",
                "| --- | --- | --- | --- | --- | --- | --- |",
            ]
        )
        for result in diagnostics:
            stats = result.stats or {}
            pool_hit_text = ", ".join(result.pool_hits or []) or "—"
            lines.append(
                f"| {result.case.case_id} | {stats.get('vector_groups', 0)} | "
                f"{stats.get('vector_repos', 0)} | {stats.get('keyword_repos', 0)} | "
                f"{stats.get('pool_size', 0)} | {pool_hit_text} | "
                f"{stats.get('query_count', 0)} |"
            )

    lines.extend(
        [
            "",
            "## 解读",
            "",
            "- 主口径看「相关率」与「至少 1 个相关」：它回答的是候选是否满足需求，"
            "不受标注集是否完整影响。",
            "- 「标注命中」只作参考：标注仓库可能根本不在语料库内，低分不代表检索能力差。",
            "- 「候选池 recall」衡量召回阶段是否把相关仓库找进池；若它明显高于 recall@K，"
            "说明问题在最终排序（fit/重排），而不在候选生成。",
            "- 任何未实际运行的指标都应留空或标注，不得估算。",
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
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="跳过匹配缓存，确保评测反映当前召回策略",
    )
    parser.add_argument(
        "--no-judge",
        action="store_true",
        help="跳过相关性判定，只跑标注精确匹配口径",
    )
    parser.add_argument(
        "--judge-cache",
        type=Path,
        default=WORKER_DIR / "tests" / "eval" / ".judge-cache.json",
        help="相关性判定缓存文件，按请求内容哈希复用",
    )
    args = parser.parse_args()

    settings = get_settings()
    judge = None
    if not args.no_judge:
        judge = RelevanceJudge(
            build_chat_model(settings),
            cache_path=args.judge_cache,
        )

    try:
        asyncio.run(
            run(
                args.dataset,
                args.limit,
                args.report,
                args.max_cases,
                use_cache=not args.no_cache,
                judge=judge,
            )
        )
    except KeyboardInterrupt:
        raise SystemExit(130) from None


if __name__ == "__main__":
    main()
