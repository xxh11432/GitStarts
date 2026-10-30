import json
from typing import Any

import pytest
from langchain_core.messages import AIMessageChunk, ToolMessage

from app.api import chat
from app.clients.backend import QuotaExceededError
from app.clients.llm import LlmNotConfiguredError

USER_HEADER = {"X-User-Id": "7"}
CHAT_PATH = "/ai/chat/stream"


class FakeLlm:
    """按脚本流式返回 chunk；脚本元素为 Exception 时抛出。"""

    def __init__(self, scripts: list[list[Any]]) -> None:
        self._scripts = scripts
        self.calls: list[list[Any]] = []

    async def astream(self, messages: list[Any]):
        self.calls.append(list(messages))
        for item in self._scripts.pop(0):
            if isinstance(item, BaseException):
                raise item
            yield item


class FakeBackend:
    def __init__(self, *, quota_error: QuotaExceededError | None = None) -> None:
        self.quota_error = quota_error
        self.conversations: list[dict[str, Any]] = []
        self.messages: list[dict[str, Any]] = []
        self.reserves: list[dict[str, Any]] = []
        self.commits: list[dict[str, Any]] = []
        self.releases: list[dict[str, Any]] = []

    async def reserve_chat_quota(
        self,
        user_id: int,
        *,
        client_key: str,
        fingerprint: str,
        request_id: str | None = None,
    ) -> dict[str, Any]:
        if self.quota_error is not None:
            raise self.quota_error
        self.reserves.append(
            {
                "user_id": user_id,
                "client_key": client_key,
                "fingerprint": fingerprint,
                "request_id": request_id,
            }
        )
        return {
            "allowed": True,
            "used": 1,
            "limit": 30,
            "remaining": 29,
            "idemKey": f"key-{client_key[:8]}",
            "replayed": False,
        }

    async def commit_quota(self, **kwargs: Any) -> None:
        self.commits.append(kwargs)

    async def release_quota(self, **kwargs: Any) -> None:
        self.releases.append(kwargs)

    async def get_conversation(self, conversation_id: int, *, user_id: int) -> dict[str, Any]:
        return {"id": conversation_id, "userId": user_id}

    async def create_conversation(self, **kwargs: Any) -> int:
        self.conversations.append(kwargs)
        return 101

    async def append_message(self, **kwargs: Any) -> int:
        self.messages.append(kwargs)
        return len(self.messages)

    async def search_repos(self, **kwargs: Any) -> list[dict[str, Any]]:
        return [
            {
                "fullName": "langgenius/dify",
                "description": "LLM 应用开发平台",
                "language": "TypeScript",
                "license": "Apache-2.0",
                "stars": 50000,
                "category": "ai",
                "platform": "other",
                "pushedAt": "2025-01-01T00:00:00",
                "topics": ["llm"],
            }
        ]

    async def get_repo(self, full_name: str) -> dict[str, Any]:
        return {"fullName": full_name, "stars": 1}

    async def get_rank(self, **kwargs: Any) -> list[dict[str, Any]]:
        return [{"fullName": "vercel/next.js", "stars": 100}]


def _tool_call_chunk(name: str, args: dict[str, Any], call_id: str = "call_1") -> AIMessageChunk:
    return AIMessageChunk(
        content="",
        tool_call_chunks=[
            {"name": name, "args": json.dumps(args), "id": call_id, "index": 0}
        ],
    )


def _parse(body: str) -> list[tuple[str, dict[str, Any]]]:
    events: list[tuple[str, dict[str, Any]]] = []
    for block in body.strip().split("\n\n"):
        if not block.strip():
            continue
        name = ""
        data = ""
        for line in block.splitlines():
            if line.startswith("event: "):
                name = line.removeprefix("event: ")
            elif line.startswith("data: "):
                data = line.removeprefix("data: ")
        events.append((name, json.loads(data)))
    return events


def _install(monkeypatch: pytest.MonkeyPatch, llm: Any, backend: FakeBackend) -> None:
    monkeypatch.setattr(chat, "build_llm", lambda settings: llm)
    monkeypatch.setattr(chat, "build_backend", lambda settings: backend)


def test_chat_stream_event_order_tool_and_persistence(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    llm = FakeLlm(
        [
            [_tool_call_chunk("search_repos", {"q": "知识库"})],
            [AIMessageChunk(content="推荐 "), AIMessageChunk(content="dify。")],
        ]
    )
    backend = FakeBackend()
    _install(monkeypatch, llm, backend)

    with client.stream(
        "POST",
        CHAT_PATH,
        headers=USER_HEADER,
        json={
            "turnId": "turn-123",
            "messages": [{"role": "user", "content": "有没有自托管知识库"}],
        },
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        body = response.read().decode("utf-8")

    events = _parse(body)
    names = [name for name, _ in events]
    assert names == [
        "meta",
        "status",
        "status",
        "tool",
        "repos",
        "status",
        "delta",
        "delta",
        "done",
    ]
    assert events[0][1]["conversationId"] == 101
    assert events[3][1]["name"] == "search_repos"
    assert events[3][1]["ok"] is True
    assert events[4][1]["items"][0]["fullName"] == "langgenius/dify"
    assert events[-1][1]["conversationId"] == 101

    # 工具结果必须包裹为不可信数据
    tool_messages = [m for m in llm.calls[1] if isinstance(m, ToolMessage)]
    assert len(tool_messages) == 1
    assert "[TOOL_DATA]" in tool_messages[0].content
    assert "[/TOOL_DATA]" in tool_messages[0].content

    # 用户消息与助手消息都异步落库
    assert backend.conversations[0]["user_id"] == 7
    assert [m["role"] for m in backend.messages] == ["user", "assistant"]
    assert backend.messages[1]["content"] == "推荐 dify。"
    assert backend.messages[1]["refs"][0]["fullName"] == "langgenius/dify"

    # 幂等键使用前端 turnId；有产出后必须 commit 而不是 release
    assert backend.reserves[0]["client_key"] == "turn-123"
    assert backend.commits
    assert backend.commits[0]["idem_key"] == "key-turn-123"
    assert not backend.releases


def test_chat_stream_requires_login(client) -> None:
    response = client.post(
        CHAT_PATH,
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_chat_stream_quota_exceeded(client, monkeypatch: pytest.MonkeyPatch) -> None:
    llm = FakeLlm([[AIMessageChunk(content="不会执行")]])
    backend = FakeBackend(
        quota_error=QuotaExceededError(
            "今日 AI 对话额度已用完",
            used=30,
            limit=30,
            reset_at="2026-01-02T00:00:00+08:00",
        )
    )
    _install(monkeypatch, llm, backend)

    response = client.post(
        CHAT_PATH,
        headers=USER_HEADER,
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert response.status_code == 429
    body = response.json()
    assert body["code"] == "quota_exceeded"
    assert body["limit"] == 30
    assert not llm.calls


def test_chat_stream_llm_not_configured(client, monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(settings: Any) -> Any:
        raise LlmNotConfiguredError("missing")

    monkeypatch.setattr(chat, "build_llm", _raise)
    monkeypatch.setattr(chat, "build_backend", lambda settings: FakeBackend())

    response = client.post(
        CHAT_PATH,
        headers=USER_HEADER,
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert response.status_code == 503
    assert response.json()["code"] == "llm_not_configured"
    assert "LLM_API_KEY" not in response.text


def test_chat_stream_trims_history(client, monkeypatch: pytest.MonkeyPatch) -> None:
    llm = FakeLlm([[AIMessageChunk(content="ok")]])
    backend = FakeBackend()
    _install(monkeypatch, llm, backend)

    messages = [
        {"role": "user" if index % 2 == 0 else "assistant", "content": f"第 {index} 条"}
        for index in range(15)
    ]
    response = client.post(CHAT_PATH, headers=USER_HEADER, json={"messages": messages})
    assert response.status_code == 200
    response.read()

    first_call = llm.calls[0]
    # system + 最近 10 条
    assert len(first_call) == 11


def test_chat_stream_retries_once_then_falls_back(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    llm = FakeLlm(
        [
            [RuntimeError("first failure")],
            [RuntimeError("second failure")],
        ]
    )
    backend = FakeBackend()
    _install(monkeypatch, llm, backend)

    with client.stream(
        "POST",
        CHAT_PATH,
        headers=USER_HEADER,
        json={"messages": [{"role": "user", "content": "hi"}]},
    ) as response:
        body = response.read().decode("utf-8")

    events = _parse(body)
    names = [name for name, _ in events]
    assert names == ["meta", "status", "delta", "done"]
    assert "暂时不可用" in events[2][1]["text"]
    assert len(llm.calls) == 2
