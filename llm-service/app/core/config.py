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
    llm_base_url: str = "https://api.himodels.ai/v1"
    llm_api_key: str = ""
    llm_chat_model: str = "deepseek-v4-flash"
    # 思考模式：HiModels 的 DeepSeek V4 默认输出 reasoning，会挤占 max_tokens
    # 导致正文为空；auto 表示不传该参数，交由供应商默认行为。
    llm_thinking_mode: Literal["auto", "enabled", "disabled"] = "disabled"

    # Embedding：默认调用硅基流动（SiliconFlow）的 OpenAI 兼容接口，
    # 进程内不加载本地模型，容器常驻内存约 100 MB。
    # fastembed 仅作为离线备用；embedding_base_url/api_key 为空时回落到 LLM_* 配置。
    embedding_provider: Literal["fastembed", "api"] = "api"
    embedding_base_url: str = "https://api.siliconflow.cn/v1"
    embedding_api_key: str = ""
    llm_embedding_model: str = "BAAI/bge-m3"
    llm_embedding_dim: int = 1024
    fastembed_cache: str = "/models"

    # Rerank：默认复用 embedding 的供应商与 Key（硅基流动 bge-reranker-v2-m3）
    rerank_enabled: bool = True
    rerank_base_url: str = ""  # 空则回落到 EMBEDDING_BASE_URL
    rerank_api_key: str = ""  # 空则回落到 EMBEDDING_API_KEY
    rerank_model: str = "BAAI/bge-reranker-v2-m3"
    rerank_batch_size: int = 32
    # 融合权重：0.6 × rerank + 0.4 × RRF；设为 0 等价于关闭融合
    rerank_weight: float = 0.6
    rerank_timeout_seconds: float = 20.0

    # Infrastructure
    backend_url: str = "http://localhost:8080"
    backend_timeout_seconds: float = 5.0
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    checkpoint_redis_url: str = "redis://localhost:6379/1"
    internal_token: str = ""

    # Service budgets（配额与 token 预算统一由 backend 权威控制）
    compare_concurrency: int = 4
    request_timeout_seconds: float = 120.0

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
    github_api_base: str = "https://api.github.com"
    # SSRF 白名单：仅允许向这些主机发起 README / manifest 抓取，逗号分隔
    github_allowed_hosts: str = "api.github.com"
    github_timeout_seconds: float = 20.0
    github_max_retries: int = 3
    github_backoff_seconds: float = 1.0
    # Worker 与 backend 共享同一 Token 配额：限速给采集与业务检索留余量（0 表示不限速）
    github_requests_per_minute: int = 60

    # Semantic index (M4)
    qdrant_collection: str = "repo_chunks"
    # 低内存部署：向量与 HNSW 落盘，避免集合常驻内存随仓库数增长
    qdrant_on_disk: bool = True
    # Qdrant 查询路径：HNSW 图只有几 MB，pinned 后不再随机读盘
    qdrant_hnsw_memory: Literal["cold", "cached", "pinned"] = "pinned"
    # 标量量化：int8 常驻内存，原始 float32 仍落盘用于 rescore
    qdrant_quantization_enabled: bool = False
    qdrant_quantization_quantile: float = 0.99
    qdrant_quantization_memory: Literal["cold", "cached", "pinned"] = "pinned"
    qdrant_quantization_rescore: bool = True
    qdrant_quantization_oversampling: float = 2.0
    embedding_batch_size: int = 16
    index_page_size: int = 100
    index_chunk_target_tokens: int = 600
    index_chunk_min_tokens: int = 400
    index_chunk_max_tokens: int = 800
    index_chunk_overlap_tokens: int = 80
    index_interval_minutes: int = 60
    index_on_startup: bool = True
    index_max_repos: int = 0  # 0 = 不限；用于本地小样本验证
    index_full_rebuild: bool = False
    index_manifests_enabled: bool = True

    # Match (M4)
    match_limit_default: int = 6
    match_recall_limit: int = 60
    match_keyword_limit: int = 12
    match_cache_ttl_seconds: int = 600
    # 分组召回：limit 表示仓库数；关闭后回退到 chunk 召回 + 应用层聚合
    match_group_recall_enabled: bool = True
    match_group_size: int = 2
    # RRF 通道内线性衰减：score = max(0, 1 - decay × (rank - 1))
    match_rrf_decay: float = 0.02
    match_query_max: int = 3
    match_cache_version: str = "v2"

    # Compare (M5)
    compare_schema_version: str = "v1"
    compare_evidence_topk: int = 6
    compare_cache_ttl_seconds: int = 7 * 24 * 3600
    compare_checkpoint_ttl_seconds: int = 3600
    compare_analysis_cache_ttl_seconds: int = 7 * 24 * 3600
    compare_timeout_seconds: float = 240.0
    compare_cell_value_max_chars: int = 400
    compare_llm_max_tokens: int = 1600

    # Health probes must stay fast and never fail the request.
    health_timeout_seconds: float = Field(default=1.0, ge=0.1, le=5.0)


@lru_cache
def get_settings() -> Settings:
    return Settings()
