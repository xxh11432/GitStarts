"""M4 语义匹配召回评测：只用 LLM-as-Judge 计算指标。

用法（需 backend、Qdrant、Redis、LLM 均可用，且索引已建好）：

    cd llm-service
    python -m tests.eval.run_eval
    python -m tests.eval.run_eval --dataset tests/eval/dataset40-optimized.jsonl --limit 6

指标口径：
- Judge Recall@K：TopK 内 match 数 / 已判定候选数
- Judge Hit@K：TopK 是否至少有一个 match
- 同时给出 match+partial 的宽松口径，便于观察召回线索覆盖

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
from app.graphs.match_graph import (
    MatchRunner,
    parse_requirement,
    split_sub_questions,
    subquestion_limit,
)
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
    notes: str = ""


@dataclass
class EvalResult:
    case: EvalCase
    retrieved: list[str]
    took_ms: int
    error: str | None = None
    stats: dict[str, Any] | None = None
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
                    notes=str(raw.get("notes", "")),
                )
            )
    if not cases:
        raise SystemExit(f"数据集为空：{path}")
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
                requirement = await parse_requirement(llm, case.text)
                requirement = requirement.model_copy(
                    update={
                        "sub_questions": await split_sub_questions(
                            llm,
                            requirement.search_query,
                            max_items=subquestion_limit(requirement),
                        )
                    }
                )
                payload = requirement.model_dump()
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

    pool_names = list((runner.recall_stats or {}).get("pool_names") or [])

    return EvalResult(
        case=case,
        retrieved=names,
        took_ms=took_ms,
        error=error,
        stats=runner.recall_stats or None,
        judgement=judgement,
        judge_ms=judge_ms,
        pool_names=pool_names,
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
        status = "ERROR" if result.error else "OK"
        stats = summarize(
            (result.judgement.verdicts if result.judgement else {}), result.retrieved
        )
        judged = stats.judged
        recall = stats.relevant / judged if judged else 0.0
        recall_any = (stats.relevant + stats.partial) / judged if judged else 0.0
        print(
            f"    {status}, match/partial/mismatch="
            f"{stats.relevant}/{stats.partial}/{stats.mismatch}, "
            f"hit@{limit}={1 if stats.relevant else 0}, "
            f"hit_any@{limit}={1 if stats.relevant + stats.partial else 0}, "
            f"recall@{limit}={recall:.2f}, recall_any@{limit}={recall_any:.2f}, "
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

    total_match = total_partial = total_mismatch = total_unknown = 0
    hit_match_cases = hit_any_cases = 0
    recall_match_sum = recall_any_sum = 0.0
    rr_match_sum = rr_any_sum = 0.0
    match_count_sum = any_count_sum = 0

    def first_rank(verdicts: dict[str, str], names: list[str], accepted: set[str]) -> int | None:
        for index, name in enumerate(names, start=1):
            if verdicts.get(name) in accepted:
                return index
        return None

    for result in judged:
        verdicts = result.judgement.verdicts if result.judgement else {}
        stats = summarize(verdicts, result.retrieved)
        total_match += stats.relevant
        total_partial += stats.partial
        total_mismatch += stats.mismatch
        total_unknown += stats.unknown
        judged_candidates = stats.judged
        match_count_sum += stats.relevant
        any_count = stats.relevant + stats.partial
        any_count_sum += any_count
        if stats.relevant:
            hit_match_cases += 1
        if any_count:
            hit_any_cases += 1
        if judged_candidates:
            recall_match_sum += stats.relevant / judged_candidates
            recall_any_sum += any_count / judged_candidates
        match_rank = first_relevant_rank(verdicts, result.retrieved)
        any_rank = first_rank(verdicts, result.retrieved, {"match", "partial"})
        rr_match_sum += 1.0 / match_rank if match_rank else 0.0
        rr_any_sum += 1.0 / any_rank if any_rank else 0.0

    judged_count = len(judged)
    case_count = judged_count if judged_count else 0
    recall_match = recall_match_sum / judged_count if judged_count else 0.0
    recall_any = recall_any_sum / judged_count if judged_count else 0.0
    mrr_match = rr_match_sum / judged_count if judged_count else 0.0
    mrr_any = rr_any_sum / judged_count if judged_count else 0.0
    average_match_count = match_count_sum / judged_count if judged_count else 0.0
    average_any_count = any_count_sum / judged_count if judged_count else 0.0

    lines = [
        "# 语义匹配召回评测（LLM-as-Judge）",
        "",
        f"- 生成时间：{datetime.now().astimezone().isoformat(timespec='seconds')}",
        f"- 数据集：`{dataset}`（{len(results)} 条）",
        f"- 模型：`{settings.llm_chat_model}`；embedding：`{settings.llm_embedding_model}`"
        f"（{settings.embedding_provider}，{settings.llm_embedding_dim} 维）",
        f"- rerank：`{settings.rerank_model}`（子问题多路 RRF 取前 60，加权 rerank）",
        "- 指标口径：仅 LLM-as-Judge，不使用 expected 标注命中；"
        "match / partial / mismatch 由 Judge 逐候选判定",
        f"- Recall@{limit}：match 数 ÷ 已判定候选数；宽松口径为 (match+partial) ÷ 已判定候选数",
        f"- Hit@{limit}：Top{limit} 是否至少有 1 个 match；宽松口径为至少 1 个 match/partial",
        "",
        "## 汇总（LLM-as-Judge）",
        "",
        "| 指标 | 数值 |",
        "| --- | --- |",
        f"| 成功用例 | {len(evaluated)} / {len(results)} |",
        f"| 判定成功用例 | {judged_count} / {len(evaluated) if evaluated else 0} |",
        f"| Hit@{limit}（至少 1 个 match） | {hit_match_cases} / {case_count} |",
        f"| Hit@{limit}（至少 1 个 match/partial） | {hit_any_cases} / {case_count} |",
        f"| Recall@{limit}（match） | {recall_match:.3f} |",
        f"| Recall@{limit}（match+partial） | {recall_any:.3f} |",
        f"| MRR@{limit}（首个 match） | {mrr_match:.3f} |",
        f"| MRR@{limit}（首个 match/partial） | {mrr_any:.3f} |",
        f"| 平均 match 数@{limit} | {average_match_count:.2f} |",
        f"| 平均 match+partial 数@{limit} | {average_any_count:.2f} |",
        f"| 已判定候选数（match/partial/mismatch/未判定） | "
        f"{total_match}/{total_partial}/{total_mismatch}/{total_unknown} |",
        "",
        "## 逐条结果",
        "",
        "| 用例 | 描述 | match | partial | mismatch | 首个 match | 首个可接受 | 耗时(ms) |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for result in results:
        text = result.case.text.replace("|", " ").replace("\n", " ")[:60]
        if result.judgement is None or result.judgement.error is not None:
            lines.append(
                f"| {result.case.case_id} | {text} | — | — | — | — | — | "
                f"{result.took_ms} |"
            )
            continue
        stats = summarize(result.judgement.verdicts, result.retrieved)
        match_rank = first_relevant_rank(result.judgement.verdicts, result.retrieved)
        any_rank = first_rank(
            result.judgement.verdicts, result.retrieved, {"match", "partial"}
        )
        lines.append(
            f"| {result.case.case_id} | {text} | {stats.relevant} | {stats.partial} | "
            f"{stats.mismatch} | {match_rank if match_rank else '—'} | "
            f"{any_rank if any_rank else '—'} | {result.took_ms} |"
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
                "| 用例 | 分组召回仓库 | 向量仓库 | 关键词仓库 | 候选池 | 子问题数 | "
                "RRF 权重 | 查询数 |",
                "| --- | --- | --- | --- | --- | --- | --- | --- |",
            ]
        )
        for result in diagnostics:
            stats = result.stats or {}
            weights = stats.get("route_weights") or []
            weight_text = "/".join(f"{float(weight):.2f}" for weight in weights) or "—"
            lines.append(
                f"| {result.case.case_id} | {stats.get('vector_groups', 0)} | "
                f"{stats.get('vector_repos', 0)} | {stats.get('keyword_repos', 0)} | "
                f"{stats.get('pool_size', 0)} | {stats.get('sub_question_count', 0)} | "
                f"{weight_text} | {stats.get('query_count', 0)} |"
            )

    lines.extend(
        [
            "",
            "## 解读",
            "",
            f"- Hit@{limit} 衡量 Top{limit} 是否至少有一个可直接选型的 match；"
            "宽松口径把 partial 也视为可用线索。",
            f"- Recall@{limit} 的分母是已判定候选数（通常等于 Top{limit}），"
            "因此它反映 TopK 内相关候选的占比，不依赖人工标注全集。",
            "- 未判定候选会计入 unknown，不进入 Recall 分母；判定失败需单独看错误列。",
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
