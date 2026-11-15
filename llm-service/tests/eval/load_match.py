"""RAG 匹配链路压测：SSE 首字 / 召回 / 总耗时 + Top-1 判定。

在 llm-service 容器内运行（需要 app 包、基于 SSE 直连本机 8081）：

    PYTHONPATH=/app python /tmp/load_match.py \
        --base http://127.0.0.1:8081 \
        --dataset /app/tests/eval/dataset40-optimized.jsonl \
        --stages warmup:1:2,quality:2:80,probe3:3:40 \
        --out /tmp/rag-load-summary.json \
        --report /tmp/rag-load-report.md

说明：
- 直连 llm-service，绕过 Nginx 的 `/ai/` 限流；请求带 `X-User-Id`，模拟已登录用户。
- 每个请求使用独立虚拟用户 id（`--user-base` 起），因此匹配缓存必然不命中，
  也不会撞上 30 次/天的用户配额；压测结束后按 user_id 清理测试数据。
- 首字 = 客户端收到第一个 SSE 事件（`status: filtering`）的耗时；
  召回完成 = 第一个 `candidate` 事件；纯召回段 = 召回完成 - `status: retrieving`。
- Top-1 准确率 = 对 quality 档每条用例的 Top-1 候选做 LLM-as-Judge，
  match 为严格口径，match+partial 为宽松口径。
- 上游限流会让结构化解析失败并走兜底 query（HTTP 仍为 200），这类降级样本
  不计入延迟分位数与 Top-1，只在报告中单独计数。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx


@dataclass
class Case:
    case_id: str
    text: str


@dataclass
class RequestResult:
    stage: str
    case_id: str
    user_id: int
    ok: bool = False
    status: int = 0
    error: str = ""
    ttfb_ms: int = 0
    first_event_ms: int = 0
    parsed_ms: int = 0
    retrieving_ms: int = 0
    reranking_ms: int = 0
    first_candidate_ms: int = 0
    done_ms: int = 0
    total_ms: int = 0
    cached: bool = False
    degraded: bool = False
    sub_questions: int = 0
    server_took_ms: int = 0
    candidates: list[dict[str, Any]] = field(default_factory=list)

    @property
    def recall_stage_ms(self) -> int:
        if self.retrieving_ms and self.first_candidate_ms:
            return max(0, self.first_candidate_ms - self.retrieving_ms)
        return 0

    @property
    def top1(self) -> str:
        if not self.candidates:
            return ""
        return str((self.candidates[0].get("repo") or {}).get("fullName") or "")


def load_dataset(path: Path) -> list[Case]:
    cases: list[Case] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            raw = json.loads(line)
            cases.append(Case(case_id=str(raw["id"]), text=str(raw["text"])))
    if not cases:
        raise SystemExit(f"数据集为空：{path}")
    return cases


def ms_since(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


def percentile(values: list[float], p: float) -> float:
    """线性插值分位数；样本较小时 P99 接近最大值，需在报告中注明。"""
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    rank = (len(ordered) - 1) * p
    low = math.floor(rank)
    high = math.ceil(rank)
    if low == high:
        return float(ordered[low])
    return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)


def distribution(values: list[int]) -> dict[str, float]:
    clean = [float(value) for value in values if value]
    if not clean:
        return {"count": 0, "avg": 0.0, "p50": 0.0, "p95": 0.0, "p99": 0.0, "max": 0.0}
    return {
        "count": len(clean),
        "avg": round(sum(clean) / len(clean), 1),
        "p50": round(percentile(clean, 0.50), 1),
        "p95": round(percentile(clean, 0.95), 1),
        "p99": round(percentile(clean, 0.99), 1),
        "max": round(max(clean), 1),
    }


async def one_request(
    client: httpx.AsyncClient,
    *,
    stage: str,
    case: Case,
    user_id: int,
    limit: int,
    read_timeout: float,
) -> RequestResult:
    result = RequestResult(stage=stage, case_id=case.case_id, user_id=user_id)
    payload = {"rawText": case.text, "limit": limit}
    headers = {"X-User-Id": str(user_id), "Accept": "text/event-stream"}
    started = time.perf_counter()
    try:
        async with asyncio.timeout(read_timeout + 30):
            async with client.stream(
                "POST",
                "/ai/match",
                json=payload,
                headers=headers,
                timeout=httpx.Timeout(connect=10.0, read=read_timeout, write=10.0, pool=10.0),
            ) as response:
                result.ttfb_ms = ms_since(started)
                result.status = response.status_code
                if response.status_code != 200:
                    body = await response.aread()
                    result.error = f"HTTP {response.status_code}: {body[:200]!r}"
                    return result

                event = ""
                async for line in response.aiter_lines():
                    if not line:
                        event = ""
                        continue
                    if line.startswith("event:"):
                        event = line[6:].strip()
                        if not result.first_event_ms:
                            result.first_event_ms = ms_since(started)
                        continue
                    if not line.startswith("data:"):
                        continue
                    try:
                        data = json.loads(line[5:].strip())
                    except ValueError:
                        continue
                    if event == "parsed" and not result.parsed_ms:
                        result.parsed_ms = ms_since(started)
                        requirement = data.get("requirement") or {}
                        result.degraded = bool(requirement.get("degraded"))
                        result.sub_questions = len(requirement.get("sub_questions") or [])
                    elif event == "status":
                        stage_name = str(data.get("stage") or "")
                        if stage_name == "retrieving" and not result.retrieving_ms:
                            result.retrieving_ms = ms_since(started)
                        elif stage_name == "reranking" and not result.reranking_ms:
                            result.reranking_ms = ms_since(started)
                    elif event == "candidate":
                        if not result.first_candidate_ms:
                            result.first_candidate_ms = ms_since(started)
                        result.candidates.append(data)
                    elif event == "done":
                        result.cached = bool(data.get("cached"))
                        result.server_took_ms = int(data.get("tookMs") or 0)
                        result.done_ms = ms_since(started)
                    elif event == "error":
                        result.error = str(data.get("message") or data.get("code") or "error")
                result.ok = bool(result.candidates) and not result.error
    except Exception as exc:  # noqa: BLE001 - 压测需要记录所有失败
        result.error = f"{type(exc).__name__}: {exc}"
    finally:
        result.total_ms = ms_since(started)
    return result


async def run_stage(
    stage: str,
    concurrency: int,
    requests: int,
    cases: list[Case],
    *,
    base: str,
    user_base: int,
    limit: int,
    read_timeout: float,
) -> list[RequestResult]:
    results: list[RequestResult] = []
    queue: asyncio.Queue[int] = asyncio.Queue()
    for index in range(requests):
        queue.put_nowait(index)

    limits = httpx.Limits(max_connections=concurrency + 2, max_keepalive_connections=concurrency)
    async with httpx.AsyncClient(base_url=base, limits=limits) as client:
        async def worker() -> None:
            while True:
                try:
                    index = queue.get_nowait()
                except asyncio.QueueEmpty:
                    return
                case = cases[index % len(cases)]
                user_id = user_base + index
                result = await one_request(
                    client,
                    stage=stage,
                    case=case,
                    user_id=user_id,
                    limit=limit,
                    read_timeout=read_timeout,
                )
                results.append(result)
                state = "OK" if result.ok else "FAIL"
                print(
                    f"[{stage}] {index + 1}/{requests} {case.case_id} {state} "
                    f"first={result.first_event_ms}ms recall={result.first_candidate_ms}ms "
                    f"total={result.total_ms}ms err={result.error[:80]}",
                    flush=True,
                )

        await asyncio.gather(*[worker() for _ in range(max(1, concurrency))])
    return results


def summarize_stage(stage: str, results: list[RequestResult]) -> dict[str, Any]:
    ok = [item for item in results if item.ok]
    failed = [item for item in results if not item.ok]
    degraded = [item for item in ok if item.degraded]
    valid = [item for item in ok if not item.degraded and not item.cached]
    return {
        "stage": stage,
        "requests": len(results),
        "success": len(ok),
        "valid": len(valid),
        "degraded": len(degraded),
        "errorRate": round(len(failed) / max(len(results), 1), 4),
        "cached": sum(1 for item in ok if item.cached),
        "ttfb": distribution([item.ttfb_ms for item in valid]),
        "firstEvent": distribution([item.first_event_ms for item in valid]),
        "parsed": distribution([item.parsed_ms for item in valid]),
        "firstCandidate": distribution([item.first_candidate_ms for item in valid]),
        "recallStage": distribution([item.recall_stage_ms for item in valid]),
        "total": distribution([item.total_ms for item in valid]),
        "serverTook": distribution([item.server_took_ms for item in valid]),
        "subQuestions": distribution([item.sub_questions for item in valid]),
        "statusCodes": sorted({item.status for item in results}),
        "errors": [
            {"case": item.case_id, "status": item.status, "error": item.error}
            for item in failed[:10]
        ],
        "degradedCases": [item.case_id for item in degraded[:10]],
    }


async def judge_top1(
    quality: list[RequestResult],
    cases: list[Case],
    *,
    limit: int,
    cache_path: Path | None,
) -> dict[str, Any]:
    from app.clients.llm import build_chat_model
    from app.core.config import get_settings
    from tests.eval.judge import RelevanceJudge

    judge = RelevanceJudge(
        build_chat_model(get_settings()),
        cache_path=cache_path,
    )
    by_id = {case.case_id: case for case in cases}
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for result in quality:
        if not result.ok or not result.candidates or result.case_id in seen:
            continue
        if result.degraded:
            continue
        seen.add(result.case_id)
        case = by_id.get(result.case_id)
        if case is None:
            continue
        top1 = result.candidates[0]
        full_name = result.top1
        judgement = await judge.judge(
            case_text=case.text,
            requirement=None,
            candidates=[top1],
        )
        verdict = judgement.verdicts.get(full_name, "unknown")
        rows.append(
            {
                "caseId": result.case_id,
                "fullName": full_name,
                "verdict": verdict,
                "reason": judgement.reasons.get(full_name, ""),
                "judgeError": judgement.error or "",
                "firstCandidateMs": result.first_candidate_ms,
            }
        )
        print(f"[judge] {result.case_id} -> {full_name}: {verdict}", flush=True)

    judged = [row for row in rows if row["verdict"] in {"match", "partial", "mismatch"}]
    matches = sum(1 for row in judged if row["verdict"] == "match")
    accepts = sum(1 for row in judged if row["verdict"] in {"match", "partial"})
    return {
        "cases": len(rows),
        "judged": len(judged),
        "match": matches,
        "matchOrPartial": accepts,
        "top1Accuracy": round(matches / len(judged), 4) if judged else 0.0,
        "top1AccuracyLoose": round(accepts / len(judged), 4) if judged else 0.0,
        "rows": rows,
    }


def render_report(summary: dict[str, Any]) -> str:
    stages = summary["stages"]
    top1 = summary.get("top1") or {}
    lines: list[str] = []
    lines.append("# RAG 匹配链路压测报告")
    lines.append("")
    lines.append(f"- 日期：{summary['date']}")
    lines.append(
        f"- 代码版本：`{summary['commit']}`（冻结版 RAG，"
        f"缓存版本 `{summary['cacheVersion']}`）"
    )
    lines.append(f"- 目标：`{summary['base']}`（容器内直连 llm-service，绕过 Nginx 限流）")
    lines.append(f"- 数据集：`{summary['dataset']}`（40 条，`limit={summary['limit']}`）")
    lines.append("")
    lines.append("## 1. 结论")
    lines.append("")
    if top1:
        lines.append(
            f"- Top-1 准确率：严格口径 **{top1['match']}/{top1['judged']}"
            f"（{top1['top1Accuracy']:.1%}）**，match+partial 宽松口径 "
            f"**{top1['matchOrPartial']}/{top1['judged']}（{top1['top1AccuracyLoose']:.1%}）**。"
        )
    for stage in stages:
        if stage["stage"] == "warmup":
            continue
        lines.append(
            f"- `{stage['stage']}`（并发 {summary['stageMeta'][stage['stage']]['concurrency']}，"
            f"有效 {stage['valid']}/{stage['requests']}，降级 {stage['degraded']}，"
            f"失败 {stage['requests'] - stage['success']}）："
            f"首字 P95 **{stage['firstEvent']['p95']:.0f} ms** / "
            f"P99 **{stage['firstEvent']['p99']:.0f} ms**；召回平均 "
            f"**{stage['firstCandidate']['avg']:.0f} ms**"
            f"（P95 {stage['firstCandidate']['p95']:.0f} ms）；"
            f"总耗时平均 {stage['total']['avg']:.0f} ms / P95 {stage['total']['p95']:.0f} ms。"
        )
    lines.append("")
    lines.append("## 2. 方法")
    lines.append("")
    lines.append(
        "- 每条请求使用独立虚拟用户 id，匹配缓存必然不命中，也不会触发 30 次/天配额；"
        "压测结束后按 `user_id` 清理测试数据。"
    )
    lines.append(
        "- 延迟均为客户端观测：首字 = 第一个 SSE 事件（`status: filtering`）；"
        "召回完成 = 第一个 `candidate`；纯召回段 = 召回完成 − `status: retrieving`；"
        "总耗时 = 流结束。"
    )
    lines.append(
        "- 分位数使用线性插值；小样本下 P99 接近最大值，仅作长尾参考。"
    )
    lines.append("")
    lines.append("## 3. 延迟结果")
    lines.append("")
    lines.append(
        "| 档位 | 并发 | 请求 | 成功 | 有效 | 降级 | 失败 | 首字 P50 | 首字 P95 | 首字 P99 "
        "| 召回完成 avg | 召回完成 P95 | 纯召回 avg | 总耗时 P50 | 总耗时 P95 | 总耗时 P99 |"
    )
    lines.append(
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: "
        "| ---: | ---: | ---: | ---: | ---: | ---: |"
    )
    for stage in stages:
        meta = summary["stageMeta"][stage["stage"]]
        lines.append(
            f"| {stage['stage']} | {meta['concurrency']} | {stage['requests']} | "
            f"{stage['success']} | {stage['valid']} | {stage['degraded']} | "
            f"{stage['requests'] - stage['success']} | "
            f"{stage['firstEvent']['p50']:.0f} | "
            f"{stage['firstEvent']['p95']:.0f} | {stage['firstEvent']['p99']:.0f} | "
            f"{stage['firstCandidate']['avg']:.0f} | {stage['firstCandidate']['p95']:.0f} | "
            f"{stage['recallStage']['avg']:.0f} | {stage['total']['p50']:.0f} | "
            f"{stage['total']['p95']:.0f} | {stage['total']['p99']:.0f} |"
        )
    lines.append("")
    lines.append(
        "单位：毫秒。延迟分位数只统计「有效」样本：请求成功、未走降级解析、未命中缓存。"
    )
    lines.append("")
    if top1:
        lines.append("## 4. Top-1 准确率")
        lines.append("")
        lines.append("| 用例 | Top-1 | 判定 | 判定理由 |")
        lines.append("| --- | --- | --- | --- |")
        for row in top1["rows"]:
            lines.append(
                f"| {row['caseId']} | {row['fullName']} | {row['verdict']} | "
                f"{str(row['reason']).replace('|', '/')[:80]} |"
            )
        lines.append("")
    lines.append("## 5. 错误与边界")
    lines.append("")
    for stage in stages:
        if stage["errors"]:
            lines.append(f"- `{stage['stage']}` 失败样例：")
            for item in stage["errors"]:
                lines.append(
                    f"  - `{item['case']}` → HTTP {item['status']} / {item['error'][:160]}"
                )
        else:
            lines.append(f"- `{stage['stage']}` 无失败请求。")
        if stage["degradedCases"]:
            lines.append(
                f"- `{stage['stage']}` 降级样例（结构化解析失败，走兜底 query）："
                + "、".join(f"`{name}`" for name in stage["degradedCases"])
            )
    lines.append(
        "- 压测只覆盖 `/ai/match` 单接口；不含 Nginx、前端渲染与真实多 IP 限流。"
    )
    lines.append(
        "- 结果受模型供应商当时容量影响；跨天对比需固定同一时间段重跑。"
    )
    lines.append("")
    return "\n".join(lines)


async def main_async(args: argparse.Namespace) -> None:
    cases = load_dataset(Path(args.dataset))
    stage_specs: list[tuple[str, int, int]] = []
    for raw in args.stages.split(","):
        name, concurrency, requests = raw.split(":")
        stage_specs.append((name, int(concurrency), int(requests)))

    all_results: list[RequestResult] = []
    stage_meta: dict[str, dict[str, int]] = {}
    stages: list[dict[str, Any]] = []
    quality_results: list[RequestResult] = []
    user_offset = 0
    for name, concurrency, requests in stage_specs:
        stage_meta[name] = {"concurrency": concurrency, "requests": requests}
        print(f"=== stage {name}: concurrency={concurrency} requests={requests}", flush=True)
        results = await run_stage(
            name,
            concurrency,
            requests,
            cases,
            base=args.base,
            user_base=args.user_base + user_offset,
            limit=args.limit,
            read_timeout=args.read_timeout,
        )
        user_offset += max(1, requests) * 10
        if name != "warmup":
            stages.append(summarize_stage(name, results))
        if name == "quality":
            quality_results = results
        all_results.extend(results)

    top1: dict[str, Any] | None = None
    if quality_results and args.judge:
        top1 = await judge_top1(
            quality_results,
            cases,
            limit=args.limit,
            cache_path=Path(args.judge_cache) if args.judge_cache else None,
        )

    summary = {
        "date": args.date,
        "commit": args.commit,
        "cacheVersion": args.cache_version,
        "base": args.base,
        "dataset": args.dataset,
        "limit": args.limit,
        "userBase": args.user_base,
        "stageMeta": stage_meta,
        "stages": stages,
        "top1": top1,
        "results": [
            {
                "stage": item.stage,
                "caseId": item.case_id,
                "ok": item.ok,
                "status": item.status,
                "firstEventMs": item.first_event_ms,
                "parsedMs": item.parsed_ms,
                "firstCandidateMs": item.first_candidate_ms,
                "recallStageMs": item.recall_stage_ms,
                "totalMs": item.total_ms,
                "serverTookMs": item.server_took_ms,
                "cached": item.cached,
                "degraded": item.degraded,
                "subQuestions": item.sub_questions,
                "top1": item.top1,
                "error": item.error,
            }
            for item in all_results
        ],
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    report = Path(args.report)
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(render_report(summary), encoding="utf-8")
    print(f"summary written to {out}")
    print(f"report written to {report}")


def main() -> None:
    parser = argparse.ArgumentParser(description="RAG 匹配链路压测")
    parser.add_argument("--base", default="http://127.0.0.1:8081", help="llm-service 地址")
    parser.add_argument(
        "--dataset",
        default="/app/tests/eval/dataset40-optimized.jsonl",
        help="评测数据集 JSONL",
    )
    parser.add_argument("--limit", type=int, default=6, help="每条用例返回候选数")
    parser.add_argument(
        "--stages",
        default="warmup:1:2,quality:2:80,probe3:3:40",
        help="档位，格式 name:concurrency:requests",
    )
    parser.add_argument("--user-base", type=int, default=900000, help="虚拟用户 id 起始值")
    parser.add_argument("--read-timeout", type=float, default=120.0, help="单请求读超时（秒）")
    parser.add_argument("--judge", action="store_true", default=True, help="对 Top-1 做 LLM 判定")
    parser.add_argument("--no-judge", dest="judge", action="store_false")
    parser.add_argument(
        "--judge-cache",
        default="/tmp/rag-load-judge-cache.json",
        help="Top-1 判定缓存路径",
    )
    parser.add_argument("--out", default="/tmp/rag-load-summary.json")
    parser.add_argument("--report", default="/tmp/rag-load-report.md")
    parser.add_argument("--commit", default="8c1c436", help="被测代码版本")
    parser.add_argument("--cache-version", default="v7", help="MATCH_CACHE_VERSION")
    parser.add_argument("--date", default="2026-11-15")
    main_args = parser.parse_args()
    asyncio.run(main_async(main_args))


if __name__ == "__main__":
    main()
