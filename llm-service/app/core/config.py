from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Every value comes from the environment (12-factor)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "llm-service"
    app_version: str = "0.1.0"
    environment: str = "production"
    log_level: str = "INFO"

    # LLM (OpenAI-compatible). Only this service holds the key.
    llm_base_url: str = "https://api.siliconflow.cn/v1"
    llm_api_key: str = ""
    llm_chat_model: str = "deepseek-ai/DeepSeek-V3"

    # Embedding: local fastembed by default, or provider API.
    # NOTE: fastembed does not ship an ONNX build of BAAI/bge-m3, so the local
    # default is the supported 1024-dim multilingual model. Switch to "api"
    # (and set LLM_EMBEDDING_MODEL=BAAI/bge-m3) when bge-m3 is required.
    embedding_provider: Literal["fastembed", "api"] = "fastembed"
    llm_embedding_model: str = "intfloat/multilingual-e5-large"
    llm_embedding_dim: int = 1024
    fastembed_cache: str = "/models"

    # Infrastructure
    backend_url: str = "http://localhost:8080"
    backend_timeout_seconds: float = 5.0
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    checkpoint_redis_url: str = "redis://localhost:6379/1"
    internal_token: str = ""

    # Service budgets
    quota_chat_daily: int = 30
    quota_compare_daily: int = 3
    compare_concurrency: int = 4
    request_timeout_seconds: float = 60.0

    # Chat graph (M3)
    llm_timeout_seconds: float = 45.0
    llm_max_retries: int = 1
    llm_max_tokens: int = 1200
    chat_history_limit: int = 10
    chat_tool_round_limit: int = 3
    chat_persist_retries: int = 2

    # Worker
    worker_enabled: bool = True
    worker_heartbeat_minutes: int = 5
    github_token: str = ""

    # Health probes must stay fast and never fail the request.
    health_timeout_seconds: float = Field(default=1.0, ge=0.1, le=5.0)


@lru_cache
def get_settings() -> Settings:
    return Settings()
