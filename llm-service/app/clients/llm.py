from langchain_openai import ChatOpenAI

from app.core.config import Settings


class LlmNotConfiguredError(RuntimeError):
    """缺少模型 Key：对外只暴露可读提示，绝不泄漏配置细节。"""


def build_chat_model(settings: Settings, *, max_tokens: int | None = None) -> ChatOpenAI:
    if not settings.llm_api_key:
        raise LlmNotConfiguredError("LLM_API_KEY 未配置")

    extra_body: dict[str, object] = {}
    if settings.llm_thinking_mode in ("enabled", "disabled"):
        # 供应商私有参数必须走 extra_body，否则会被 OpenAI SDK 当作非法入参拒绝
        extra_body["thinking"] = {"type": settings.llm_thinking_mode}

    return ChatOpenAI(
        model=settings.llm_chat_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=0.2,
        max_tokens=max_tokens or settings.llm_max_tokens,
        timeout=settings.llm_timeout_seconds,
        # 重试由 chat graph 控制，避免 SDK 与节点重试叠加放大延迟
        max_retries=0,
        extra_body=extra_body or None,
    )
