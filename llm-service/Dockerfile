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

# Build-time embedding warmup keeps the first request from downloading a model.
# fastembed has no ONNX build of BAAI/bge-m3, so the local default is the
# supported 1024-dim multilingual model; set PREWARM_MODELS=false for fast builds.
ARG PREWARM_MODELS=true
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

RUN if [ "$PREWARM_MODELS" = "true" ]; then \
        python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='${LLM_EMBEDDING_MODEL}', cache_dir='/models')"; \
    else \
        echo "skip embedding warmup"; \
    fi \
    && chown -R app:app /models

USER app

EXPOSE 8081

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8081"]
