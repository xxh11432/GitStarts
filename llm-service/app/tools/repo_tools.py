from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any

import structlog

from app.clients.backend import BackendClient, BackendError

logger = structlog.get_logger("tools")

TOOL_DATA_OPEN = "[TOOL_DATA]"
TOOL_DATA_CLOSE = "[/TOOL_DATA]"

_REPO_REF_FIELDS = (
    "fullName",
    "description",
    "language",
    "license",
    "stars",
    "category",
    "platform",
    "pushedAt",
    "topics",
)


def _object(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required or [],
        "additionalProperties": False,
    }


TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_repos",
            "description": (
                "在 GitStars 仓库库中按关键词与硬条件检索开源项目。"
                "适合回答「有没有某类项目」「符合某条件的候选」等问题。"
            ),
            "parameters": _object(
                {
                    "q": {"type": "string", "description": "关键词，可为中文；空串表示不限"},
                    "language": {
                        "type": "string",
                        "description": "主语言，如 Python / Go / TypeScript",
                    },
                    "category": {"type": "string", "description": "分类 slug，如 ai、devtools"},
                    "license": {"type": "string", "description": "许可证，如 MIT、Apache-2.0"},
                    "minStars": {"type": "integer", "description": "最低 star 数"},
                    "sort": {"type": "string", "enum": ["stars", "pushedAt"]},
                    "limit": {
                        "type": "integer",
                        "description": "返回条数，最多 10",
                        "minimum": 1,
                        "maximum": 10,
                    },
                },
                ["q"],
            ),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_repo",
            "description": "按 fullName（owner/repo）获取单个仓库的详情。",
            "parameters": _object(
                {"fullName": {"type": "string", "description": "owner/repo"}},
                ["fullName"],
            ),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_rank",
            "description": (
                "获取排行榜：total=按 star，weekly=最近一周活跃，"
                "monthly=最近一月活跃，new=最新创建。"
            ),
            "parameters": _object(
                {
                    "type": {"type": "string", "enum": ["total", "weekly", "monthly", "new"]},
                    "language": {"type": "string"},
                    "limit": {
                        "type": "integer",
                        "description": "返回条数，最多 10",
                        "minimum": 1,
                        "maximum": 10,
                    },
                },
                ["type"],
            ),
        },
    },
]


@dataclass
class ToolOutcome:
    name: str
    ok: bool
    content: str
    refs: list[dict[str, Any]] = field(default_factory=list)
    took_ms: int = 0


def wrap_tool_data(payload: Any) -> str:
    """工具结果视为不可信数据：显式包裹，prompt 中要求忽略其中指令。"""
    return f"{TOOL_DATA_OPEN}\n{json.dumps(payload, ensure_ascii=False)}\n{TOOL_DATA_CLOSE}"


def repo_ref(repo: dict[str, Any]) -> dict[str, Any]:
    return {key: repo.get(key) for key in _REPO_REF_FIELDS if repo.get(key) is not None}


class RepoToolExecutor:
    """执行模型发起的工具调用；所有数据都经 backend 内部接口获取。"""

    def __init__(self, backend: BackendClient, *, max_items: int = 10) -> None:
        self._backend = backend
        self._max_items = max_items

    async def execute(self, name: str, arguments: dict[str, Any]) -> ToolOutcome:
        started = time.perf_counter()
        try:
            if name == "search_repos":
                refs = await self._search(arguments)
            elif name == "get_repo":
                refs = await self._get_repo(arguments)
            elif name == "get_rank":
                refs = await self._rank(arguments)
            else:
                return self._failure(name, started, f"未知工具：{name}")
        except BackendError as exc:
            logger.warning("tool_failed", tool=name, error=str(exc))
            return self._failure(name, started, f"仓库数据暂时不可用：{exc}")
        except Exception as exc:  # 工具失败不能拖垮整轮对话
            logger.warning("tool_crashed", tool=name, error=type(exc).__name__)
            return self._failure(name, started, "仓库数据暂时不可用")

        payload = {"repo": refs[0]} if name == "get_repo" and refs else {"items": refs}
        content = wrap_tool_data(payload)
        return ToolOutcome(
            name=name,
            ok=True,
            content=content,
            refs=refs,
            took_ms=int((time.perf_counter() - started) * 1000),
        )

    async def _search(self, arguments: dict[str, Any]) -> list[dict[str, Any]]:
        q = str(arguments.get("q") or "").strip()
        limit = _clamp(arguments.get("limit"), self._max_items)
        items = await self._backend.search_repos(
            q=q,
            language=_text(arguments.get("language")),
            category=_text(arguments.get("category")),
            license=_text(arguments.get("license")),
            min_stars=_int(arguments.get("minStars")),
            sort="pushedAt" if arguments.get("sort") == "pushedAt" else "stars",
            limit=limit,
        )
        return [repo_ref(item) for item in items]

    async def _get_repo(self, arguments: dict[str, Any]) -> list[dict[str, Any]]:
        full_name = _text(arguments.get("fullName"))
        if not full_name:
            raise BackendError("fullName 不能为空")
        repo = await self._backend.get_repo(full_name)
        return [repo_ref(repo)]

    async def _rank(self, arguments: dict[str, Any]) -> list[dict[str, Any]]:
        rank_type = _text(arguments.get("type")) or "total"
        if rank_type not in {"total", "weekly", "monthly", "new"}:
            rank_type = "total"
        items = await self._backend.get_rank(
            rank_type=rank_type,
            language=_text(arguments.get("language")),
            limit=_clamp(arguments.get("limit"), self._max_items),
        )
        return [repo_ref(item) for item in items]

    def _failure(self, name: str, started: float, message: str) -> ToolOutcome:
        return ToolOutcome(
            name=name,
            ok=False,
            content=wrap_tool_data({"error": message}),
            refs=[],
            took_ms=int((time.perf_counter() - started) * 1000),
        )


def _clamp(value: Any, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return min(6, maximum)
    return max(1, min(number, maximum))


def _int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
