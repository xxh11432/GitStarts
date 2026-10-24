from dataclasses import dataclass, field

from langchain_core.messages import BaseMessage


@dataclass
class ChatState:
    """对话状态：消息、工具预算与引用集合。"""

    messages: list[BaseMessage]
    tool_budget: int = 3
    refs: list[dict] = field(default_factory=list)
    tool_trace: list[dict] = field(default_factory=list)
    answer: str = ""
    tokens_in: int = 0
    tokens_out: int = 0
