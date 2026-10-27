# Qdrant 检索层优化方案（2C2G / 2C4G）

本文记录 `gitstars-tx` 线上 Qdrant 持续读盘、拖慢整机的问题、根因与可执行方案。
所有数字来自 2026-10-27 的实机观测，不是估算。

## 1. 结论摘要

- 当前问题不是“缺少 MQ/高并发组件”，而是 **Qdrant 内存配额与数据规模不匹配导致的 mmap thrashing**。
- 2C2G 上唯一可行的根治方向：**int8 标量量化 + 量化向量/HNSW 常驻内存 + 原始向量落盘做 rescore**，把 Qdrant 常驻内存从约 149M 压到约 100M。
- 2C2G 能救回稳定，但吞吐上限仍是 2 核的 35~40 rps；长期增长需要 2C4G 或更高 IOPS 的盘。
- 只加 swap、只加内存不改容器配额，都不会解决问题。

## 2. 现状与证据

### 2.1 宿主机

| 项 | 实测值 |
|---|---|
| CPU | 2 vCPU |
| 内存 | 1935 MiB，已用约 1544 MiB，available 约 391 MiB |
| 磁盘 | 40G，使用 49%，`rotational=1` |
| 负载 | load average 2.21~2.55 |
| CPU 分布 | us 4.8%、sy 9.5%、**iowait 77~81%**、idle 4.8% |
| 磁盘 | 约 3000 IOPS、19~20 MB/s、await 4.26ms、**%util 96%**、aqu-sz 12.8 |
| Swap | 合计 4.0G，已用 927M；`/swap.img` 1.9G 在用，`/swapfile` 2G 未用（优先级 -3） |
| CPU 限制 | 所有容器 `NanoCpus=0`，没有 CPU 配额 |

### 2.2 容器

| 容器 | 用量 / 上限 | 说明 |
|---|---|---|
| qdrant | 149.7M / 160M | 93%，只剩约 10M 余量 |
| backend | 316M / 448M | JVM 参数把 448M 预算用满 |
| mysql | 141M / 224M | 被换出 104M |
| ingest-worker | 108.9M / 192M | 被换出 98M |
| llm-service | 150.6M / 256M | 被换出 19.5M |
| frontend | 66M / 512M | 空闲态 |

容器 `mem_limit` 合计 **1952M > 物理 1935M**，本身已经超配。

### 2.3 Qdrant

| 项 | 实测值 |
|---|---|
| 集合 | `repo_chunks_bge_m3` |
| points / vectors | 49,574 / 52,575 |
| segments | 4 |
| 状态 | `yellow` |
| `running_optimizations` | 1，持续不降 |
| 存储配置 | vectors on_disk、HNSW on_disk、payload on_disk |
| 索引数据 | 608M |
| 读盘 | 20 MB/s 持续；37 小时累计 `read_bytes` **1.51 TB** |
| 系统调用 | `rchar` 仅 16.8 MB、`syscr` 仅 2829 次 |

`rchar` 很小而 `read_bytes` 极大，说明读盘几乎全部来自 **mmap page fault**，不是业务 `read()`。

### 2.4 流量

Nginx 1 小时约 706 个 200 响应，约 12 请求/分钟，另有少量漏洞扫描 404。
也就是说，当前读盘与真实业务流量无关，是 Qdrant 后台优化在空转。

## 3. 根因

1. `on_disk=true` 只决定向量、HNSW、payload 的**存放与查询布局**，不会让 HNSW 的**构建过程**直接发生在磁盘上。
2. 优化器需要在内存中合并段、重建 HNSW：读源段 → 构建新图 → 写新段 → 原子替换。
3. 52,575 × 1024 × 4B ≈ **205 MiB** 裸向量，集合 608M；而 Qdrant 上限只有 160M。
4. 工作集装不下，page cache 被 cgroup 回收；再次访问触发 major page fault，重新读盘，形成循环。
5. 4 个 segment 合并时读放大；磁盘只有 3000 IOPS，被重复读打满。
6. 日志中出现 `Cleaned an optimization handle after timeout, explicitly triggering optimizers`，说明优化任务超时后被清理并重新触发。
7. 结果：不是“算不完”，而是“每次算到一半被内存/超时打断，然后从头再来”。

## 4. 优化目标与约束

| 约束 | 说明 |
|---|---|
| 不改 embedding 模型/维度 | 继续使用 bge-m3、1024 维，避免重建索引语义 |
| 不改分块契约 | 400–800 tokens、目标 600、重叠 80，见 AGENT.md |
| 不引入新中间件 | 2C2G 上 Kafka/RabbitMQ 只会进一步挤占内存 |
| 保证证据质量 | 对比链路依赖 manifest 证据，不优先关闭 manifest |
| 可回滚 | 任何变更都要保留旧数据卷或旧集合 |

目标：

- Qdrant 空载常驻内存 ≤ 224M（2C2G）或 ≤ 1.2G（2C4G）。
- 空载磁盘 `%util` < 10%，`iowait` < 10%。
- `running_optimizations = 0`，collection `status = green`。
- 匹配 recall@10 相对基线下降 ≤ 2 个百分点。
- 对比证据覆盖率下降 ≤ 5 个百分点。

## 5. 方案一：2C2G 原地量化（推荐）

### 5.1 总体思路

- 量化向量 int8 常驻内存（约 54M）。
- HNSW 图常驻内存（约 7M）。
- 原始 float32 向量继续落盘，只用于 rescore 的少量候选。
- payload 继续落盘，查询只读 Top-K。
- 查询开启 `rescore=true`、`oversampling=2`，质量接近 float32。

内存账：

| 项 | float32 现状 | int8 后 |
|---|---|---|
| 向量 | 约 205 MB | 约 54 MB（pinned） |
| HNSW 图 | 约 7 MB（盘上） | 约 7 MB（pinned） |
| payload | 盘上 | 盘上 |
| Qdrant 常驻 | 149 MB | 约 90–110 MB |

### 5.2 代码改动

#### 5.2.1 `llm-service/app/core/config.py`

在 `qdrant_on_disk` 后新增：

```python
    # Qdrant 查询路径：HNSW 图只有几 MB，pinned 后不再随机读盘
    qdrant_hnsw_memory: Literal["cold", "cached", "pinned"] = "pinned"
    # 标量量化：int8 常驻内存，原始 float32 仍落盘用于 rescore
    qdrant_quantization_enabled: bool = False
    qdrant_quantization_quantile: float = 0.99
    qdrant_quantization_memory: Literal["cold", "cached", "pinned"] = "pinned"
    qdrant_quantization_rescore: bool = True
    qdrant_quantization_oversampling: float = 2.0
```

#### 5.2.2 `llm-service/app/clients/vector.py`：建集合

只有 worker 会调用 `ensure_collection`，集合由 worker 创建；llm-service 只查询。
替换 `create_collection` 部分：

```python
        if not exists:
            quantization = None
            if self._settings.qdrant_quantization_enabled:
                quantization = models.ScalarQuantization(
                    scalar=models.ScalarQuantizationConfig(
                        type=models.ScalarType.INT8,
                        quantile=self._settings.qdrant_quantization_quantile,
                        memory=models.Memory(self._settings.qdrant_quantization_memory),
                    )
                )
            await client.create_collection(
                collection_name=self.collection,
                vectors_config=models.VectorParams(
                    size=self._settings.llm_embedding_dim,
                    distance=models.Distance.COSINE,
                    on_disk=self._settings.qdrant_on_disk,
                ),
                # HNSW 图常驻内存，避免查询时逐跳读盘
                hnsw_config=models.HnswConfigDiff(
                    memory=models.Memory(self._settings.qdrant_hnsw_memory),
                ),
                quantization_config=quantization,
            )
            created = True
```

注意：`ensure_collection` 只在新集合不存在时生效。对已有集合做量化，必须用第 5.4 节的 PATCH。

#### 5.2.3 `llm-service/app/clients/vector.py`：查询

在 `search()` 的 `query_points` 前加：

```python
        search_params = None
        if self._settings.qdrant_quantization_enabled:
            search_params = models.SearchParams(
                quantization=models.QuantizationSearchParams(
                    rescore=self._settings.qdrant_quantization_rescore,
                    oversampling=self._settings.qdrant_quantization_oversampling,
                )
            )
```

并给 `query_points` 增加：

```python
            search_params=search_params,
```

已确认 `qdrant-client==1.20.0` 支持 `Memory.PINNED`、`ScalarQuantizationConfig.memory`、`SearchParams.quantization`。

### 5.3 配置改动

#### 5.3.1 `docker-compose.yml`

llm-service 与 ingest-worker **两处**都要加，保持一致：

```yaml
      QDRANT_HNSW_MEMORY: ${QDRANT_HNSW_MEMORY:-pinned}
      QDRANT_QUANTIZATION_ENABLED: ${QDRANT_QUANTIZATION_ENABLED:-false}
      QDRANT_QUANTIZATION_QUANTILE: ${QDRANT_QUANTIZATION_QUANTILE:-0.99}
      QDRANT_QUANTIZATION_MEMORY: ${QDRANT_QUANTIZATION_MEMORY:-pinned}
      QDRANT_QUANTIZATION_RESCORE: ${QDRANT_QUANTIZATION_RESCORE:-true}
      QDRANT_QUANTIZATION_OVERSAMPLING: ${QDRANT_QUANTIZATION_OVERSAMPLING:-2.0}
```

#### 5.3.2 `.env.example`

同步以上 6 个变量，默认关闭量化。

#### 5.3.3 `README.md`

- 环境变量表新增 6 行。
- “数据与索引”的 Qdrant 段补充：int8 量化、量化向量 pinned、原始向量落盘用于 rescore。

#### 5.3.4 服务器 `.env`

```dotenv
QDRANT_COLLECTION=repo_chunks_bge_m3
QDRANT_HNSW_MEMORY=pinned
QDRANT_QUANTIZATION_ENABLED=true
QDRANT_QUANTIZATION_QUANTILE=0.99
QDRANT_QUANTIZATION_MEMORY=pinned
QDRANT_QUANTIZATION_RESCORE=true
QDRANT_QUANTIZATION_OVERSAMPLING=2.0

# 2C2G 配额微调：从 llm/frontend/alert/redis 挪给 qdrant
QDRANT_MEM_LIMIT=224m
LLM_MEM_LIMIT=224m
FRONTEND_MEM_LIMIT=480m
ALERT_MEM_LIMIT=24m
REDIS_MEM_LIMIT=88m
```

### 5.4 服务器执行顺序

工作目录 `/home/ubuntu/gitstars`。

#### 5.4.1 备份

```bash
cd /home/ubuntu/gitstars

sudo cp .env .env.bak.$(date +%F-%H%M)
sudo tar czf /home/ubuntu/qdrant-data-$(date +%F).tgz \
  -C /var/lib/docker/volumes/gitstars_qdrant-data/_data .
curl -s localhost:6333/collections/repo_chunks_bge_m3 > /home/ubuntu/qdrant-before.json
```

#### 5.4.2 停掉抢内存/IO 的服务

```bash
sudo docker compose stop ingest-worker alert-worker frontend llm-service
sudo docker update --memory 384m --memory-swap 384m gs-qdrant
```

backend / mysql / redis / qdrant 保持运行，worker 重建时需要 backend 内部接口。

#### 5.4.3 部署代码与配置

```bash
sudo docker compose build llm-service
sudo docker compose up -d qdrant
```

#### 5.4.4 原地加量化

```bash
curl -s -X PATCH http://localhost:6333/collections/repo_chunks_bge_m3 \
  -H 'Content-Type: application/json' \
  -d '{"quantization_config":{"scalar":{"type":"int8","quantile":0.99,"memory":"pinned"}},
       "hnsw_config":{"memory":"pinned"}}'
```

#### 5.4.5 观察优化器

```bash
watch -n 5 'curl -s localhost:6333/collections/repo_chunks_bge_m3 \
  | python3 -c "import sys,json;r=json.load(sys.stdin)[\"result\"];print(r[\"status\"],r[\"optimizer_status\"],r[\"points_count\"],r[\"segments_count\"])"; \
  curl -s localhost:6333/metrics | grep running_optimizations'
```

期望：

- `status=green`
- `running_optimizations=0`
- Qdrant RSS < 224M
- 空载磁盘 `%util` < 10%

如果长时间 `yellow` 或 `running_optimizations=1` 不降，进入第 7 节。

#### 5.4.6 恢复服务

```bash
# 先起 llm-service，验证查询
sudo docker compose up -d llm-service
curl -s localhost/ai/health
# 验证一次匹配请求后，再起前端与 worker
sudo docker compose up -d frontend alert-worker ingest-worker
```

#### 5.4.7 降回稳态配额

```bash
sudo docker update --memory 224m --memory-swap 224m gs-qdrant
```

如果 `docker stats` 显示 Qdrant 常驻已超过 224M，先保持 256M，从 frontend/llm 继续挪，不要强行压低。

#### 5.4.8 索引降频

```dotenv
INDEX_INTERVAL_MINUTES=240
```

避免每小时触发一次段合并；全量重建只放低峰。

### 5.5 评测

镜像不包含 `tests/`，通过 bind mount 运行：

```bash
cd /home/ubuntu/gitstars

sudo docker compose run --rm --no-deps --entrypoint python -u root \
  -v /home/ubuntu/gitstars/llm-service/tests:/app/tests:ro \
  -v /home/ubuntu/gitstars/doc/eval:/reports \
  llm-service -m tests.eval.run_eval --limit 10 --report /reports/baseline-int8.md

sudo docker compose run --rm --no-deps --entrypoint python -u root \
  -v /home/ubuntu/gitstars/llm-service/tests:/app/tests:ro \
  -v /home/ubuntu/gitstars/doc/eval:/reports \
  llm-service -m tests.eval.run_compare_eval --report /reports/compare-int8.md
```

报告必须由脚本生成，禁止填写估算值。

### 5.6 验收标准

| 指标 | 目标 |
|---|---|
| `iowait` | < 10% |
| 磁盘 `%util`（空载） | < 10% |
| `running_optimizations` | 0 |
| collection `status` | green |
| Qdrant RSS | < 224M |
| swap 使用 | 接近 0 |
| recall@10 | 相对基线下降 ≤ 2 个百分点 |
| 对比证据覆盖率 | 下降 ≤ 5 个百分点 |
| 信息不足率 | 上升 ≤ 5 个百分点 |

任何一项不达标，按第 8 节回滚。

## 6. 方案二：2C4G

2C4G 解决的是 page cache 和 swap，不提高 CPU 上限。

推荐配额：

| 容器 | mem_limit | 关键参数 |
|---|---|---|
| mysql | 512m | buffer pool 256M、max_connections 80 |
| redis | 160m | maxmemory 128mb |
| qdrant | 1152m | 可装下 608M 工作集 + 优化器临时内存 |
| backend | 576m | Xmx 320m、Metaspace 128m、Direct 48m |
| llm-service | 320m | compare 并发 4 |
| ingest-worker | 288m | 当前峰值 166M |
| frontend | 512m | Node heap 320m |
| alert-worker | 24m | — |
| nginx | 48m | `worker_processes` 固定为 2 |
| 合计 | 约 3592m | 宿主 4096MiB，余约 500M |

2C4G 下 int8 从“必需”降为“可选”：先用 1.1G 的 Qdrant 装下 float32 工作集；数据涨到 10 万+ points 再考虑量化。

仍然建议：

- 全量重建/优化放在低峰。
- 监控 `%util` 和 `running_optimizations`。
- 如果磁盘仍是 3000 IOPS，重建仍会慢；预算允许时优先换更高 IOPS 的盘。

## 7. 备选与降级

### 7.1 新集合重建（不推荐在 2C2G 首选）

做法：新集合名 + 全量重建，旧集合保留用于回滚。

代价：

- `full=true` 会忽略 ETag，重新抓取约 2000 个 README（60 req/min 限速）。
- 重新 embedding 约 5 万个 chunk，产生供应商费用。
- 在 2C2G 上本身就是一次大 IO/CPU 冲击。

只有在“接受更长维护窗口、需要简单回滚”时才选。

### 7.2 减量

按代价从低到高：

1. `INDEX_MANIFESTS_ENABLED=false`：去掉 manifest chunk，点数下降；代价是对比的「技术栈 / 部署」证据变少。
2. 增加单文档 chunk 上限（需改 `worker/index.py`），例如每仓最多 16 块；可能丢掉 README 尾部段落。
3. 降低 `INDEX_MAX_REPOS`：注意当前 bootstrap 在设置上限时不会写 `index_initialized`，会反复全量，需要同时改逻辑。

第一轮不建议减量，优先用量化解决内存。

### 7.3 关闭 HNSW，改全量扫描

5 万 point、int8 常驻内存时，暴力扫描在 2 核上通常可接受。设置 `hnsw_config.m=0` 可绕开“优化器重建图”的打盘源头，但需要单独验证召回与延迟，不建议作为首选。

## 8. 回滚

原地量化依赖卷备份：

```bash
sudo docker compose stop qdrant
sudo rm -rf /var/lib/docker/volumes/gitstars_qdrant-data/_data/*
sudo tar xzf /home/ubuntu/qdrant-data-YYYY-MM-DD.tgz \
  -C /var/lib/docker/volumes/gitstars_qdrant-data/_data
sudo docker compose start qdrant
```

该操作具有破坏性，只在确认备份可用时执行。

如果使用新集合方案，回滚只需把 `QDRANT_COLLECTION` 切回旧集合并重启 llm-service。

## 9. 风险与不做清单

风险：

- 优化器在 3000 IOPS 的盘上仍可能超时；此时只能减量、关闭 HNSW 或换盘。
- 量化后未开 rescore 会明显掉召回。
- Qdrant 224M 在优化期间可能不够，临时窗口必须给到 384M。
- 量化不会压缩 payload；payload 仍在盘上。

不要做：

- 不要用新增 swap 代替内存。
- 不要在 Qdrant 仍是 160M 时直接开量化。
- 不要关闭 rescore。
- 不要为省内存直接关 manifest。
- 不要修改 400–800 tokens / 重叠 80 的分块契约。
- 不要在白天跑全量重建。
- 不要在 2C2G 上引入 Kafka/RabbitMQ。

## 10. 附录：复现观测

```bash
# 宿主机
nproc; free -m; cat /proc/loadavg; vmstat 1 3
iostat -x 1 2
cat /sys/block/vda/queue/rotational

# 容器资源
sudo docker stats --no-stream
sudo docker inspect gs-qdrant | grep -E '"(Memory|NanoCpus|OOMKilled|RestartCount)"'

# Qdrant 读盘归因
sudo cat /proc/<qdrant-pid>/io
sudo pidstat -d 1 3

# 集合状态
curl -s localhost:6333/collections/repo_chunks_bge_m3
curl -s localhost:6333/metrics | grep -E 'running_optimizations|vector_io_read'
```

判读要点：

- `rchar` 很小、`read_bytes` 很大 → mmap 缺页读盘。
- `read_bytes` 持续增长但 `points_count` 不变 → 无效重复读。
- `running_optimizations=1` 长时间不降 → 优化器卡住。
