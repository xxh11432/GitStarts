"""M5 深度对比离线评测：证据覆盖率 + 信息不足率 + 真实需求盲测记录。

用法（需 backend、Qdrant、Redis、LLM 均可用，且 README/manifest 已索引）：

    cd llm-service
    python -m tests.eval.run_compare_eval
    python -m tests.eval.run_compare_eval --report ../doc/eval/compare.md

评测只跑真实流水线，不 mock 证据；报告里的指标必须来自这次运行。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from app.clients.backend import BackendClient
from app.clients.llm import build_chat_model
from app.clients.redis import CacheClient
from app.clients.vector import VectorStore
from app.core.config import Settings, get_settings
from app.graphs.compare_graph import CompareError, CompareRunner
from app.schemas.compare import CompareRequest
from app.services.embedding import EmbeddingService

LLM_SERVICE_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = LLM_SERVICE_DIR.parent


@dataclass
class CompareCase:
    case_id: str
    requirement: str
    repos: list[str]
    notes: str = ""


@dataclass
class CompareCaseResult:
    case: CompareCase
    cells: int = 0
    with_evidence: int = 0
    insufficient: int = 0
    recommended: list[str] | None = None
    took_ms: int = 0
    comparison_id: int | None = None
    error: str | None = None

    @property
    def evidence_coverage(self) -> float:
        return self.with_evidence / self.cells if self.cells else 0.0

    @property
    def insufficient_rate(self) -> float:
        return self.insufficient / self.cells if self.cells else 0.0


def load_dataset(path: Path) -> list[CompareCase]:
    cases: list[CompareCase] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            raw = json.loads(line)
            repos = [str(item) for item in raw.get("repos", [])]
            if not 2 <= len(repos) <= 4:
                raise SystemExit(f"用例 {raw.get('id')} 的 repos 必须为 2–4 个")
            cases.append(
                CompareCase(
                    case_id=str(raw["id"]),
                    requirement=str(raw["requirement"]),
                    repos=repos,
                    notes=str(raw.get("notes", "")),
                )
            )
    if not cases:
        raise SystemExit(f"数据集为空：{path}")
    return cases


async def _run_case(case: CompareCase, settings: Settings, user_id: int) -> CompareCaseResult:
    backend = BackendClient(settings)
    vector = VectorStore(settings)
    cache = CacheClient(settings)
    runner = CompareRunner(
        settings=settings,
        backend=backend,
        vector=vector,
        embedding=EmbeddingService(settings),
        llm=build_chat_model(settings, max_tokens=settings.compare_llm_max_tokens),
        cache=cache,
    )
    result = CompareCaseResult(case=case)
    started = time.perf_counter()
    try:
        prepared = await runner.prepare(
            CompareRequest(raw_text=case.requirement, repo_keys=case.repos, force=True),
            user_id=user_id,
        )
        seen: set[tuple[str, str]] = set()
        async for event in runner.run(prepared, user_id=user_id):
            if event.name == "cell":
                key = (str(event.data["repoKey"]), str(event.data["dimensionKey"]))
                if key in seen:
                    continue
                seen.add(key)
                result.cells += 1
                if event.data.get("evidence"):
                    result.with_evidence += 1
                if event.data.get("value") == "信息不足":
                    result.insufficient += 1
            elif event.name == "verdict":
                result.recommended = list(event.data.get("recommended") or [])
            elif event.name == "done":
                result.comparison_id = event.data.get("comparisonId")
            elif event.name == "error":
                result.error = str(event.data.get("message") or event.data.get("code"))
    except CompareError as exc:
        result.error = f"{exc.code}: {exc}"
    except Exception as exc:  # noqa: BLE001 - 评测需要记录所有失败
        result.error = f"{type(exc).__name__}: {exc}"
    finally:
        result.took_ms = int((time.perf_counter() - started) * 1000)
        await runner.close()
        await cache.close()
    return result


async def run(dataset: Path, report: Path, user_id: int) -> None:
    cases = load_dataset(dataset)
    settings = get_settings()
    results: list[CompareCaseResult] = []
    for index, case in enumerate(cases, start=1):
        print(f"[{index}/{len(cases)}] {case.case_id}: {case.requirement[:50]}")
        result = await _run_case(case, settings, user_id)
        results.append(result)
        status = (
            "ERROR"
            if result.error
            else (
                f"coverage={result.evidence_coverage:.2f}, "
                f"insufficient={result.insufficient_rate:.2f}"
            )
        )
        print(f"    {status}, took={result.took_ms}ms, recommended={result.recommended}")

    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(render_report(results, settings, dataset), encoding="utf-8")
    print(f"report written to {report}")


def render_report(results: list[CompareCaseResult], settings: Settings, dataset: Path) -> str:
    successful = [result for result in results if not result.error and result.cells]
    total_cells = sum(result.cells for result in successful)
    total_evidence = sum(result.with_evidence for result in successful)
    total_insufficient = sum(result.insufficient for result in successful)
    avg_coverage = total_evidence / total_cells if total_cells else 0.0
    avg_insufficient = total_insufficient / total_cells if total_cells else 0.0

    successful_comparisons = sum(1 for result in successful if result.comparison_id)
    lines = [
        "# 深度对比评测（M5）",
        "",
        f"- 生成时间：{datetime.now().astimezone().isoformat(timespec='seconds')}",
        f"- 数据集：`{dataset}`（{len(results)} 组真实需求盲测）",
        f"- 模型：`{settings.llm_chat_model}`；embedding：`{settings.llm_embedding_model}`",
        f"- schema：`{settings.compare_schema_version}`；"
        f"每格证据 topK：{settings.compare_evidence_topk}",
        "",
        "## 汇总",
        "",
        "| 指标 | 数值 |",
        "| --- | --- |",
        f"| 成功用例 | {len(successful)} / {len(results)} |",
        f"| 证据覆盖率（有证据格 / 总格） | {avg_coverage:.3f} |",
        f"| 信息不足率 | {avg_insufficient:.3f} |",
        f"| 落库成功 | {successful_comparisons} / {len(successful)} |",
        "",
        "## 逐组结果",
        "",
        "| 用例 | 需求 | 仓库 | 证据覆盖率 | 信息不足率 | 推荐 | 耗时(ms) | 备注 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for result in results:
        requirement = result.case.requirement.replace("|", " ")[:60]
        repos = ", ".join(result.case.repos)
        recommended = ", ".join(result.recommended or [])
        note = result.error or result.case.notes
        coverage = f"{result.evidence_coverage:.2f}" if result.cells else "—"
        insufficient = f"{result.insufficient_rate:.2f}" if result.cells else "—"
        lines.append(
            f"| {result.case.case_id} | {requirement} | {repos} | {coverage} | "
            f"{insufficient} | {recommended or '—'} | {result.took_ms} | {note} |"
        )

    lines.extend(
        [
            "",
            "## 验收口径",
            "",
            "- 证据覆盖率低：先查该仓库 README/manifest 是否索引成功，再考虑加大 topK。",
            "- 「信息不足」是合法结果：没有证据就不下结论；若某维度长期全线不足，"
            "应补充该维度的检索式或 manifest 抓取路径。",
            "- 推荐命中不代表正确，盲测需人工核对许可证、部署方式与功能边界。",
            "- 本报告必须来自真实服务运行；未运行的字段留空或标注，不得估算。",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="M5 深度对比评测")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=LLM_SERVICE_DIR / "tests" / "eval" / "compare_dataset.jsonl",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=REPO_ROOT / "doc" / "eval" / "compare.md",
    )
    parser.add_argument("--user-id", type=int, default=0, help="评测所用 userId（默认 0）")
    args = parser.parse_args()
    try:
        asyncio.run(run(args.dataset, args.report, args.user_id))
    except KeyboardInterrupt:
        raise SystemExit(130) from None


if __name__ == "__main__":
    main()
