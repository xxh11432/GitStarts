#!/bin/sh
set -e

# 启动时先查本地 embedding 模型缓存：命中则全程离线加载，缺失才允许联网下载。
if [ "${EMBEDDING_PROVIDER:-fastembed}" = "fastembed" ]; then
    STATUS=$(python - <<'PY'
import os
import sys

from fastembed import TextEmbedding

cache = os.environ.get("FASTEMBED_CACHE") or "/models"
model = os.environ.get("LLM_EMBEDDING_MODEL") or "intfloat/multilingual-e5-large"

repo = next(
    (item["sources"]["hf"] for item in TextEmbedding.list_supported_models() if item["model"] == model),
    None,
)
if repo is None:
    print(f"[entrypoint] {model} 不在 fastembed 支持列表中，跳过本地缓存检查", file=sys.stderr)
    print("unknown")
    raise SystemExit(0)

path = os.path.join(cache, "models--" + repo.replace("/", "--"))
# 目录存在但文件不全（例如下载中断）时仍视为缺失，让 fastembed 续传补全。
complete = os.path.isdir(path) and any(
    "model.onnx" in files for _root, _dirs, files in os.walk(path)
)
if complete:
    print(f"[entrypoint] 命中本地模型缓存 {path}，离线加载", file=sys.stderr)
    print("cached")
else:
    print(f"[entrypoint] 本地无完整 {model} 缓存，首次调用时从 HuggingFace 下载", file=sys.stderr)
    print("missing")
PY
)
    if [ "$STATUS" = "cached" ]; then
        export HF_HUB_OFFLINE=1
    fi
fi

exec "$@"
