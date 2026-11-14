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
from app.graphs.match_graph import MatchRunner, parse_requirement
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
    pool_names: list[str] | None = None


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


def load_structured(path: Path) -> dict[str, dict[str, Any]]:
    """读取冻结的结构化需求，控制变量对比多组召回参数。"""
    mapping: dict[str, dict[str, Any]] = {}
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            raw = json.loads(line)
            mapping[str(raw["id"])] = dict(raw["requirement"])
    if not mapping:
        raise SystemExit(f"结构化需求文件为空：{path}")
    return mapping


async def dump_requirements(dataset: Path, out: Path, settings: Any) -> None:
    """每条用例只解析一次并落盘，供多轮参数对比复用同一份结构化需求。"""
    cases = load_dataset(dataset)
    llm = build_chat_model(settings)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as handle:
        for index, case in enumerate(cases, start=1):
            try:
                payload = (await parse_requirement(llm, case.text)).model_dump()
            except Exception as exc:  # noqa: BLE001 - 单条失败降级，保证文件完整
                payload = {
                    "goal": case.text[:200],
                    "degraded": True,
                    "notes": [f"解析失败：{type(exc).__name__}"],
                }
            handle.write(
                json.dumps({"id": case.case_id, "requirement": payload}, ensure_ascii=False)
                + "\n"
            )
            print(f"[{index}/{len(cases)}] {case.case_id} parsed")
    print(f"requirements written to {out}")


async def evaluate(
    case: EvalCase,
    limit: int,
    *,
    use_cache: bool = True,
    judge: RelevanceJudge | None = None,
    structured: dict[str, Any] | None = None,
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
        async for event in runner.run(
            MatchRequest(raw_text=case.text, structured=structured, limit=limit), user_id=0
        ):
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
        pool_names=list((runner.recall_stats or {}).get("pool_names") or []),
    )


async def run(
    dataset: Path,
    limit: int,
    report: Path,
    max_cases: int | None,
    *,
    use_cache: bool = True,
    judge: RelevanceJudge | None = None,
    structured_by_id: dict[str, dict[str, Any]] | None = None,
    case_ids: set[str] | None = None,
    dump_pool: Path | None = None,
) -> None:
    cases = load_dataset(dataset)
    if case_ids:
        cases = [case for case in cases if case.case_id in case_ids]
    if max_cases:
        cases = cases[:max_cases]

    settings = get_settings()
    results: list[EvalResult] = []
    for index, case in enumerate(cases, start=1):
        print(f"[{index}/{len(cases)}] {case.case_id}: {case.text[:60]}")
        result = await evaluate(
            case,
            limit,
            use_cache=use_cache,
            judge=judge,
            structured=(structured_by_id or {}).get(case.case_id),
        )
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
    if dump_pool is not None:
        dump_pool.parent.mkdir(parents=True, exist_ok=True)
        with dump_pool.open("w", encoding="utf-8") as handle:
            for result in results:
                handle.write(
                    json.dumps(
                        {
                            "id": result.case.case_id,
                            "retrieved": result.retrieved,
                            "pool": result.pool_names or [],
                            "pool_size": len(result.pool_names or []),
                            "error": result.error,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
        print(f"pool dump written to {dump_pool}")
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
        f"- rerank：`{settings.rerank_model}`（双路 RRF 融合取前 60 后精排）",
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
    parser.add_argument(
        "--structured-file",
        type=Path,
        default=None,
        help="冻结的结构化需求 JSONL；指定后跳过需求解析，用于参数对比",
    )
    parser.add_argument(
        "--dump-requirements",
        type=Path,
        default=None,
        help="只解析数据集并导出结构化需求 JSONL 后退出",
    )
    parser.add_argument(
        "--case-ids",
        default="",
        help="只跑指定用例，逗号分隔（用于单点诊断）",
    )
    parser.add_argument(
        "--dump-pool",
        type=Path,
        default=None,
        help="导出每条用例的完整候选池与最终 topN，用于区分召回与排序问题",
    )
    args = parser.parse_args()

    settings = get_settings()
    if args.dump_requirements:
        asyncio.run(dump_requirements(args.dataset, args.dump_requirements, settings))
        return

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
                structured_by_id=(
                    load_structured(args.structured_file) if args.structured_file else None
                ),
                case_ids={item.strip() for item in args.case_ids.split(",") if item.strip()}
                or None,
                dump_pool=args.dump_pool,
            )
        )
    except KeyboardInterrupt:
        raise SystemExit(130) from None


if __name__ == "__main__":
    main()
