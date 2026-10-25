#!/usr/bin/env python3
"""M7 压测脚本（仅标准库）：SSE 并发、Qdrant 检索、配额扣减。

示例：
  # 对话 SSE：10 并发 × 20 次，统计首字节与总耗时
  python sse_load.py sse --url http://localhost/api/ai/chat \
      --cookie "GS_SESSION=..." --csrf "..." \
      --body '{"conversationId":null,"message":"推荐一个轻量级任务队列"}' \
      --concurrency 10 --requests 20

  # 对比 SSE（每次替换 {{i}}/{{uuid}}，用于验证配额扣减与 checkpoint）
  python sse_load.py sse --url http://localhost/api/ai/compare \
      --cookie "GS_SESSION=..." --csrf "..." \
      --body @compare.json --concurrency 2 --requests 10

  # Qdrant 检索（绕过 embedding，直接打 points/search）
  python sse_load.py qdrant --url http://localhost:6333 \
      --collection repo_chunks --dim 1024 --concurrency 20 --requests 200

注意：SSE 压测会真实消耗模型额度与配额，请使用测试账号并先确认预算。
"""

from __future__ import annotations

import argparse
import json
import random
import statistics
import threading
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field


@dataclass
class Result:
    ok: bool = False
    status: int = 0
    ttfb_ms: int = 0
    total_ms: int = 0
    events: int = 0
    error: str = ""


@dataclass
class Stats:
    results: list[Result] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def add(self, result: Result) -> None:
        with self.lock:
            self.results.append(result)


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int(round(len(ordered) * p + 0.5)) - 1))
    return ordered[index]


def load_body(raw: str, index: int) -> bytes:
    if raw.startswith("@"):
        with open(raw[1:], encoding="utf-8") as handle:
            text = handle.read()
    else:
        text = raw
    text = text.replace("{{i}}", str(index)).replace("{{uuid}}", str(uuid.uuid4()))
    return text.encode("utf-8")


def sse_request(url: str, cookie: str, csrf: str, body: bytes, timeout: float) -> Result:
    headers = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "Cookie": cookie,
    }
    if csrf:
        headers["X-XSRF-TOKEN"] = csrf
        headers["X-CSRF-TOKEN"] = csrf
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    result = Result()
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            result.status = response.status
            first = response.read(1)
            result.ttfb_ms = int((time.perf_counter() - started) * 1000)
            buffer = first + response.read()
            result.events = buffer.count(b"event:")
            result.ok = response.status == 200 and result.events > 0
            error_event = b"event: error" in buffer
            if error_event:
                result.ok = False
                snippet = buffer.decode("utf-8", "replace")[-300:]
                result.error = snippet.replace("\n", " ")
    except urllib.error.HTTPError as exc:
        result.status = exc.code
        result.error = f"HTTP {exc.code}: {exc.read(200).decode('utf-8', 'replace')}"
    except Exception as exc:  # 超时、断流、连接失败
        result.error = f"{type(exc).__name__}: {exc}"
    finally:
        result.total_ms = int((time.perf_counter() - started) * 1000)
    return result


def qdrant_request(url: str, collection: str, dim: int, timeout: float) -> Result:
    vector = [random.uniform(-1, 1) for _ in range(dim)]
    body = json.dumps({"vector": vector, "limit": 8, "with_payload": False}).encode()
    request = urllib.request.Request(
        f"{url}/collections/{collection}/points/search",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    result = Result()
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read())
            result.status = response.status
            result.ok = response.status == 200 and isinstance(payload.get("result"), list)
    except Exception as exc:
        result.error = f"{type(exc).__name__}: {exc}"
    finally:
        result.total_ms = int((time.perf_counter() - started) * 1000)
    return result


def run(args: argparse.Namespace) -> None:
    stats = Stats()
    body_cache: dict[int, bytes] = {}
    if args.mode == "sse":
        for index in range(args.requests):
            body_cache[index] = load_body(args.body, index)

    def worker(index: int) -> None:
        if args.mode == "sse":
            stats.add(
                sse_request(args.url, args.cookie, args.csrf, body_cache[index], args.timeout)
            )
        else:
            stats.add(qdrant_request(args.url, args.collection, args.dim, args.timeout))

    threads: list[threading.Thread] = []
    for index in range(args.requests):
        thread = threading.Thread(target=worker, args=(index,), daemon=True)
        thread.start()
        threads.append(thread)
        if len(threads) >= args.concurrency:
            for running in threads:
                running.join()
            threads.clear()
    for running in threads:
        running.join()

    results = stats.results
    errors = [item for item in results if not item.ok]
    totals = [item.total_ms for item in results]
    ttfts = [item.ttfb_ms for item in results if item.ttfb_ms]
    print(json.dumps(
        {
            "mode": args.mode,
            "requests": len(results),
            "concurrency": args.concurrency,
            "errorRate": round(len(errors) / max(len(results), 1), 4),
            "errors": len(errors),
            "p50Ms": int(statistics.median(totals)) if totals else 0,
            "p95Ms": int(percentile(totals, 0.95)),
            "p50TtfbMs": int(statistics.median(ttfts)) if ttfts else 0,
            "p95TtfbMs": int(percentile(ttfts, 0.95)),
            "statusCodes": sorted({item.status for item in results}),
        },
        ensure_ascii=False,
        indent=2,
    ))
    for item in errors[:5]:
        print(f"- error: {item.error[:200]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="M7 压测：SSE / Qdrant")
    sub = parser.add_subparsers(dest="mode", required=True)

    sse = sub.add_parser("sse", help="压测 /ai/chat、/ai/match、/ai/compare 的 SSE 流")
    sse.add_argument("--url", required=True, help="完整 SSE 地址，如 http://localhost/api/ai/chat")
    sse.add_argument("--cookie", required=True, help="登录 Cookie，如 GS_SESSION=...")
    sse.add_argument("--csrf", default="", help="XSRF-TOKEN 值（POST 需要）")
    sse.add_argument("--body", required=True, help="JSON 请求体；支持 @文件名 / {{i}} / {{uuid}}")
    sse.add_argument("--concurrency", type=int, default=2)
    sse.add_argument("--requests", type=int, default=10)
    sse.add_argument("--timeout", type=float, default=300)

    qdrant = sub.add_parser("qdrant", help="压测 Qdrant points/search")
    qdrant.add_argument("--url", required=True, help="Qdrant 地址，如 http://localhost:6333")
    qdrant.add_argument("--collection", required=True, help="集合名，如 repo_chunks")
    qdrant.add_argument("--dim", type=int, default=1024, help="向量维度，需与集合一致")
    qdrant.add_argument("--concurrency", type=int, default=10)
    qdrant.add_argument("--requests", type=int, default=100)
    qdrant.add_argument("--timeout", type=float, default=30)

    run(parser.parse_args())


if __name__ == "__main__":
    main()
