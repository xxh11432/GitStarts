"""LLM 用量采集：给结构化输出挂回调，累计每个请求的 token 消耗。"""

from __future__ import annotations

from typing import Any

from langchain_core.callbacks import BaseCallbackHandler


class UsageCollector(BaseCallbackHandler):
    """线程/协程内复用一个实例，跨多次模型调用累计 token。"""

    def __init__(self) -> None:
        self.tokens_in = 0
        self.tokens_out = 0

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        llm_output = getattr(response, "llm_output", None)
        usage = llm_output.get("token_usage") if isinstance(llm_output, dict) else None
        if isinstance(usage, dict) and _merge(self, usage):
            return

        for generation_list in getattr(response, "generations", None) or []:
            for generation in generation_list:
                message = getattr(generation, "message", None)
                metadata = getattr(message, "usage_metadata", None)
                if isinstance(metadata, dict):
                    _merge(self, metadata)


def _merge(collector: UsageCollector, usage: dict[str, Any]) -> bool:
    tokens_in = usage.get("input_tokens") or usage.get("prompt_tokens")
    tokens_out = usage.get("output_tokens") or usage.get("completion_tokens")
    if not isinstance(tokens_in, (int, float)) and not isinstance(tokens_out, (int, float)):
        return False
    collector.tokens_in += int(tokens_in or 0)
    collector.tokens_out += int(tokens_out or 0)
    return True
