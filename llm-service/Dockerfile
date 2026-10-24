FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.11.6 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Dependency layer first: code changes do not invalidate the resolved env.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
COPY worker ./worker
RUN uv sync --frozen --no-dev

FROM python:3.12-slim AS runtime

# 默认不在构建期下载模型：容器启动时由 docker-entrypoint.sh 检查 /models
# （Compose 中的 model-cache 卷）是否已有缓存，缺失才联网下载并持久化。
# 需要把模型打进镜像时再设 PREWARM_MODELS=true。
# fastembed 没有 BAAI/bge-m3 的 ONNX 版本，本地默认使用 1024 维多语言模型。
ARG PREWARM_MODELS=false
ARG LLM_EMBEDDING_MODEL=intfloat/multilingual-e5-large

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH" \
    FASTEMBED_CACHE=/models \
    LLM_EMBEDDING_MODEL=${LLM_EMBEDDING_MODEL}

WORKDIR /app

RUN groupadd --system app \
    && useradd --system --gid app app \
    && mkdir -p /models \
    && chown app:app /models

COPY --from=builder /app/.venv /app/.venv
COPY app ./app
COPY worker ./worker
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh \
    && if [ "$PREWARM_MODELS" = "true" ]; then \
        python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='${LLM_EMBEDDING_MODEL}', cache_dir='/models')"; \
    else \
        echo "skip embedding warmup: 模型在容器启动时优先复用 /models 缓存"; \
    fi \
    && chown -R app:app /models

USER app

EXPOSE 8081

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8081"]
