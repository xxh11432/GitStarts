from langchain_openai import ChatOpenAI

from app.core.config import Settings


class LlmNotConfiguredError(RuntimeError):
    """缺少模型 Key：对外只暴露可读提示，绝不泄漏配置细节。"""


def build_chat_model(settings: Settings, *, max_tokens: int | None = None) -> ChatOpenAI:
    if not settings.llm_api_key:
        raise LlmNotConfiguredError("LLM_API_KEY 未配置")

    return ChatOpenAI(
        model=settings.llm_chat_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=0.2,
        max_tokens=max_tokens or settings.llm_max_tokens,
        timeout=settings.llm_timeout_seconds,
        # 重试由 chat graph 控制，避免 SDK 与节点重试叠加放大延迟
        max_retries=0,
    )
