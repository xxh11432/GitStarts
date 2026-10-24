from typing import Literal

from pydantic import Field

from app.schemas.health import CamelModel


class ChatMessage(CamelModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(CamelModel):
    conversation_id: int | None = None
    idea_id: int | None = None
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
