from typing import Literal

from pydantic import Field

from app.schemas.health import CamelModel


class ChatMessage(CamelModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(CamelModel):
    conversation_id: int | None = None
    idea_id: int | None = None
    # 前端为每一轮生成并在重试时复用；后端据此做幂等扣费
    turn_id: str | None = Field(default=None, max_length=64)
    # 重试时前端置 false，避免同一轮用户消息重复落库
    persist_user: bool = True
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
