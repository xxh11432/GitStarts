# GitStars RAG 召回优化方案

| 项 | 内容 |
| --- | --- |
| 版本 | v3.0（2026-11-15；子问题多路召回 + repoSummary 索引 + 多 query rerank） |
| 状态 | 已上线：子问题拆分、加权 RRF、repoSummary 召回、`rank=rerank`；最新评测见第 0 节 |
| 适用范围 | `llm-service`（match / compare 检索）、`ingest-worker`（索引）、`backend`（仓库检索接口） |
| 部署约束 | 2C2G / 40G 磁盘；Qdrant 容器内存约 160M；集合约 6.8 万 points |
| 设计原则 | 优先确定性流水线；优先复用现有基础设施；每个阶段可独立回滚 |

> 第 4 节中的“过滤放宽阶梯”“RRF 融合”“LLM 重排 ±0.1”属于 v1.0 方案，已在 v2.0 被替代；
> v2.1 的“英文向量 + 英文 BM25 双路 RRF”也已被 v3.0 的子问题多路召回替代。
> 当前实际链路与实测结果以第 0 节为准，第 11、12 节保留为历史记录。

---

## 0. v3.0 当前链路（2026-11-15）

```text
用户想法
  → PARSE_PROMPT 结构化（must / should / exclude / keywords / search_query）
  → search_query 英文归一化
  → LLM 拆成同品类子问题（简单 1–2 条，复杂 3–4 条）
  → 每个子问题单独 embedding + Qdrant 仓库级召回（README / manifest / repo_summary，各 top 60）
  → 子问题 query 路合计权重 0.8（按条数均分）+ BM25 0.2
  → 加权 RRF 取前 60
  → 每个子问题分别对候选做 rerank（summary + description + topics）
  → 子问题 rerank 分数等权加权平均
  → rank = rerank，输出候选
```

关键约束：

- 子问题必须留在同一产品品类，只拆功能 / 部署 / 同义词，禁止扩展到相邻领域。
- 主 query 不再单独召回；只有拆不出有效子问题时才回退 `search_query`。
- `repoSummary` 以 `chunk_type=repo_summary` 写入 Qdrant，存量用 `python -m worker.summary_index` 回填。
- 最终排序不使用 stars / forks / volume；`fit` 仅作前端展示。
- v7b 40 条评测：Hit@6（match）39/40，Hit@6（match+partial）40/40，
  Recall@6（match）0.375，Recall@6（match+partial）0.812，MRR（match）0.815；
  报告见 `doc/eval/judge40-final.md`。

---

## 1. 结论摘要

召回率低的头号原因不是 embedding 模型，而是**召回单位与候选池结构**：

- 当前 `match_recall_limit=40` 表示 40 个 README 文本块，而不是 40 个仓库。
- 一个 README 按 600 tokens 切成 10 多块后，40 条命中经常只覆盖个位数仓库。
- `recall@10` 的候选池本身就不足，后面的重排、契合度权重再调也很难补救。

P0 的核心改动是：**用 Qdrant 的分组召回（`group_by=repo_id`）把“块级召回”变成“仓库级召回”**。Qdrant 1.20 已支持该接口，`repo_id` 也已有 payload 索引，因此**不需要重建索引**。

P0 同时修正三件事：

1. 需求结构化增加检索短句，避免把 2000 字原文拼成一条 query。
2. 向量召回与关键词召回用 RRF 融合，关键词候选不再固定 0.35 分。
3. 过滤条件从“全留 / 全丢”改为分级放宽，避免分类或许可证轻微不一致就误杀相关仓库。

P1 才考虑重建索引（chunk 上下文头、仓库 profile 向量）。如果 P0 已经达标，P1 不执行。

---

## 2. 现状与根因

### 2.1 当前召回链路

```text
用户想法
  → PARSE_PROMPT 结构化（must / should / exclude / goal / keywords）
  → _query_text 拼成一条最长 2000 字的 query
  → embedding
  → Qdrant chunk 召回（match_recall_limit=40）
  → 按 full_name 聚合，取最大 chunk 分
  → 关键词召回（LIKE full_name / name / description，固定 0.35 分）
  → 合并候选
  → LLM 重排（前 8 个，±0.1）
  → 契合度评分
  → 最终 topK
```

### 2.2 根因排序

| # | 问题 | 代码位置 | 影响 |
| --- | --- | --- | --- |
| 1 | 召回单位是 chunk，聚合后候选仓库太少 | `llm-service/app/graphs/match_graph.py`（召回与聚合段） | 最大。top40 块通常只覆盖 3–8 个仓库 |
| 2 | 把“偏好”当“硬过滤”，且过滤只有两档 | `match_graph.py` 的 `PARSE_PROMPT` / `collect_hard_filters`；`llm-service/app/clients/vector.py` 的 `build_filter` | 用户说“许可证宽松 / 最好 MIT”会被抽成 `must license=MIT`，BSD/ISC/MPL 全被排除 |
| 3 | 单条超长 query 稀释语义 | `match_graph.py` 的 `_query_text` | goal + keywords + 2000 字原文 + 所有条件拼成一条向量，产品名/技术名信号被平均掉 |
| 4 | 关键词通道太弱且不参与排序融合 | `match_graph.py` 的关键词段；`backend/.../service/RepoService.java` 的 `searchForAi` | LIKE 只查 fullName / name / description，不含 topics；关键词候选固定 0.35，几乎进不了最终列表 |
| 5 | chunk 向量缺少仓库上下文 | `llm-service/worker/chunk.py` 的 `_join` | 各仓库的 “Installation / Features” 段落向量高度相似，跨仓库区分度低 |
| 6 | 索引覆盖与评测口径有坑 | `llm-service/worker/pipeline.py` 的 `mark_indexed`；`config.py` 的 `match_cache_ttl_seconds` | README 缺失也会标记已索引；评测 10 分钟内重跑会命中 match 缓存，看不出改动效果 |

### 2.3 关键代码位置

| 模块 | 文件 |
| --- | --- |
| 匹配召回主流程 | `llm-service/app/graphs/match_graph.py` |
| 向量检索与过滤 | `llm-service/app/clients/vector.py` |
| 召回配置 | `llm-service/app/core/config.py`（`match_*`） |
| README 分块 | `llm-service/worker/chunk.py` |
| 索引写入 | `llm-service/worker/index.py` |
| 索引流水线 | `llm-service/worker/pipeline.py` |
| 对比证据检索 | `llm-service/app/tools/doc_tools.py` |
| 对比编排 | `llm-service/app/graphs/compare_graph.py` |
| 仓库检索接口 | `backend/src/main/java/com/githubstars/service/RepoService.java` |

---

## 3. 目标与指标

### 3.1 目标

| 目标 | 说明 |
| --- | --- |
| 召回更全 | 候选池阶段拿到足够多的“仓库”，而不是“文本块” |
| 排序更准 | 相关仓库尽量排在前面，减少用户翻找 |
| 证据可回溯 | 匹配理由与对比单元格都能回到 README / manifest |
| 延迟可控 | 多查询与分组召回不显著抬高 match P95 |
| 可回滚 | 召回策略有开关，缓存有版本号 |

### 3.2 指标

| 指标 | 定义 | 采集方式 |
| --- | --- | --- |
| recall@10 | 命中标注仓库数 / 标注仓库总数，取前 10 个候选 | `tests/eval/run_eval.py` |
| 至少命中 1 个 | 有任一命中标注仓库的用例比例 | 同上 |
| MRR@10 | 第一个命中候选排名的倒数 | 同上 |
| 分组召回仓库数 | 每次 match 的 `groups` 数量 | 结构化日志 |
| 关键词仓库数 | 关键词通道去重后的仓库数 | 结构化日志 |
| 过滤放宽次数 | L1 / L2 / L3 各触发多少次 | 结构化日志 |
| 对比证据覆盖率 | 有证据单元格 / 总单元格 | `run_compare_eval.py` |

> 历史基线文档已随迭代清理，当前唯一基线为 `doc/eval/judge40-final.md`；后续所有“提升”都以该基线为参照，禁止估算。

---

## 4. P0：不重建索引的改动

### 4.1 用 Qdrant 分组召回替代 chunk 聚合

**现状**

`VectorStore.search()` 返回 `limit` 个 chunk，`MatchRunner` 再按 `full_name` 聚合、取最大分。`match_recall_limit=40` 因此不代表 40 个仓库。

**改动**

在 `llm-service/app/clients/vector.py` 增加分组召回：

```python
@dataclass(frozen=True)
class VectorGroup:
    repo_id: int
    full_name: str
    best_score: float
    hits: list[VectorHit]


async def search_groups(
    self,
    vector: list[float],
    *,
    limit: int,
    group_size: int = 2,
    query_filter: models.Filter | None = None,
) -> list[VectorGroup]:
    client = self._connect()
    if not await client.collection_exists(self.collection):
        return []
    response = await client.query_points_groups(
        collection_name=self.collection,
        query=vector,
        group_by="repo_id",
        group_size=group_size,
        limit=limit,
        query_filter=query_filter,
        search_params=search_params,
        with_payload=[
            "repo_id", "full_name", "section", "content",
            "source_url", "chunk_type",
        ],
    )
    return [_to_group(group) for group in response.groups]
```

说明：

- `group_by="repo_id"` 使用已有 payload 索引，不需要重建集合。
- `limit` 语义变为“最多返回多少个仓库”，建议从 40 提高到 60。
- `group_size=2` 每个仓库保留 2 条最佳证据，足够用于理由与来源展示。
- 如果分组接口异常，降级到原有 `search()` + 聚合逻辑，保证可用性。
- 分组后直接得到 `repo_id` / `full_name`，不需要再做一次应用层聚合。

**预期收益**

候选仓库数从“几个到十几个”提升到“几十个”，直接抬高 recall@10 的上限；同时减少长 README 因块数多而获得的天然优势。

### 4.2 需求结构化增加检索短句

**现状**

`PARSE_PROMPT` 只输出 must / should / exclude / goal / keywords；查询时把 `goal + keywords + 原文 + 条件` 拼成一条最长 2000 字的 query。

**改动**

1. `Requirement` 增加字段 `search_query`（对外 `searchQuery`），限制 80 字。
2. `PARSE_PROMPT` 增加规则：
   - `search_query` 只写 1 句检索式，保留产品名、技术名、英文关键词；
   - 不要整句复述用户原话；
   - 不要包含“我想找一个”“需要支持”等无检索价值的词。
3. 查询构造改为 2–3 条短 query：

```text
Q1 = goal
Q2 = searchQuery + keywords
Q3 = must / should 的 key + value（截断 120 字）
```

4. 使用 `embed_queries` 批量 embedding，分别做分组召回，再进入 RRF。
5. 如果结构化失败（`degraded=true`），回退到现有 `_query_text`，不阻断主流程。

**注意**

- 这是 `Requirement` 契约的新增字段，需要同步前端匹配页的类型定义。
- 旧缓存里的 `Requirement` 不含该字段，读取时应给默认空值。

### 4.3 向量与关键词做 RRF 融合

**现状**

- 向量候选使用 cosine 分数；
- 关键词候选固定 0.35；
- 两路没有统一排序，关键词候选几乎进不了最终列表。

**改动**

1. 对每一路召回结果按仓库排名生成 RRF 分数：

```text
rrf(repo) = Σ 1 / (k + rank_i)，k 取 60
```

2. 参与融合的通道：
   - 分组向量召回（每条 query 一路，最多 3 路）；
   - 关键词召回（合并多个关键词后按最佳排名一路）。
3. 将 RRF 归一化到 0–1，作为 `semantic` 展示值；原始 cosine 分数保留在调试日志中。
4. 关键词候选不再使用固定 0.35，而是使用其在关键词通道中的真实排名。
5. 如果某仓库只在关键词通道出现，仍可凭 coverage / maintenance / license 进入最终列表，但要在风险中提示“未检索到 README 证据”。

**为什么用 RRF**

- 不需要训练、不需要额外模型；
- 对分数尺度不敏感，适合 cosine + 关键词排名混合；
- 代码量小，容易写单元测试。

### 4.4 过滤放宽阶梯

**现状**

硬条件全部作为 Qdrant `must`，只有“零命中”时才整体丢弃过滤再召回一次。部分过严时不会放宽。

**改动**

在召回阶段按以下顺序尝试，直到候选数达到 `match_limit_default`（默认 6）或尝试完：

| 级别 | 保留条件 | 说明 |
| --- | --- | --- |
| L0 | 全部 | 语言、平台、分类、许可、star |
| L1 | 去掉分类 | 模型抽取的分类与站内分类最容易不一致 |
| L2 | 再去掉许可 | “宽松”“最好 MIT”经常被误抽为硬条件 |
| L3 | 只保留语言 / 平台 | 语言与平台通常是真实硬约束 |

规则：

- 每放宽一级，记录 `relaxed` 原因；
- 在候选 `risks` 中追加“已放宽分类/许可筛选”；
- 对 fit 做轻微惩罚，建议 `0.95^level`，最低 0.9；
- 不在 L3 之后继续放宽语言和平台，避免结果完全跑偏。

### 4.5 关键词通道补 topics

**现状**

`RepoService.searchForAi` 只对 `full_name`、`name`、`description` 做 LIKE。

**改动**

- 在 `searchForAi` 的 `or()` 条件中加入 `topics` 的 LIKE。
- `topics` 是 JSON 列，LIKE 可以命中，但要注意：
  - 只作为召回补充，不承担精确过滤；
  - 查询词截断到 24 字以内；
  - 每个关键词 `limit` 从 10 提到 12，合并后去重。
- 不建议在 2C2G 上新增 MySQL 全文索引或 ngram 分词，收益与维护成本不匹配。

### 4.6 观测、缓存与评测口径

**改动**

1. 在 `MatchRunner.run` 增加一条结构化日志：

```text
match_recall_stats
  vector_groups, vector_repos, keyword_repos,
  pool_size, relaxed_level, final_count, took_ms
```

2. 匹配缓存 key 增加 pipeline 版本号，例如 `match:v2:{user}:{digest}`，避免上线后继续命中旧结果。
3. 评测脚本增加 `--no-cache`：
   - 或在运行前删除 `match:*`；
   - 或在 `MatchRunner` 增加 `force=True` 跳过缓存。
4. 评测报告新增“候选池诊断”段落，记录每条的 `vector_groups / keyword_repos / relaxed_level`。

**索引覆盖率检查**

阶段 0 先确认索引覆盖率，避免在索引不完整的情况下调召回：

```sql
SELECT
  (SELECT COUNT(*) FROM repositories
     WHERE disabled = 0 AND archived = 0) AS active_repos,
  (SELECT COUNT(DISTINCT repo_id) FROM repo_documents
     WHERE kind = 'readme'
       AND content IS NOT NULL
       AND content <> '') AS indexed_readme;
```

如果 `indexed_readme` 明显小于 `active_repos`，先修索引流水线，再谈召回策略。

---

## 5. P1：需要重建索引的改动（可选）

只有在 P0 跑完仍不达标时，才进入 P1。不要默认执行。

### 5.1 给 README chunk 加短上下文头

**目的**

不同仓库的 “Installation”“Features” 段落向量高度相似，缺少仓库身份信息。

**做法**

embedding 输入改为：

```text
repo: owner/name
desc: 仓库描述前 120 字
section: Installation

<原始 chunk 内容>
```

注意：

- 只改 embedding 输入，不改 Qdrant payload 里的 `content`；
- 证据展示仍使用原始内容，避免用户看到拼接头；
- 需要全量重建索引。

### 5.2 每个仓库增加 profile 向量

**目的**

如果分组召回仍然漏掉“明显相关但 README 很长/很短”的仓库，可以为每个仓库生成 1 条 profile 向量：

```text
full_name + description + topics + README 首段（300–500 tokens）
```

- `chunk_type="profile"`；
- match 只在 profile 上召回，`match_recall_limit` 直接表示仓库数；
- compare 仍使用 readme / manifest，不受影响。

**成本**

- 约 4k 个仓库各增加 1 条向量，embedding 调用量很小；
- Qdrant points 增加约 4k，在 160M 内存限制下需要观察；
- 需要全量重建或增量补 profile。

### 5.3 新集合与切换方式

- 新集合命名：`repo_chunks_bge_m3_v2`；
- 通过环境变量 `QDRANT_COLLECTION` 切换；
- 先全量重建，再切读流量，旧集合保留至少 7 天用于回滚；
- 重建期间不要同时开启 BM25 稀疏索引，避免 Qdrant 内存超限。

---

## 6. 对比链路的证据召回

对比链路的 recall 不是“候选仓库”，而是“每个维度的证据覆盖率”。建议做两个小改动：

1. `tech_stack` / `deploy` 两个维度优先查 `manifest`，再查 README：
   - manifest 先取 top 3；
   - 不足时用 README 补 top 3；
   - 其余维度保持 README 优先。
2. 每个维度最多取 3 条进入 prompt，但检索时可以取 6–8 条，给 `match_evidence` 更多回退空间。
3. 保持现有规则：无证据写“信息不足”，不编造。

---

## 7. 配置项变更

| 配置 | 现值 | 建议值 | 说明 |
| --- | --- | --- | --- |
| `match_recall_limit` | 40 | 60 | 分组召回后语义变为“仓库数” |
| `match_keyword_limit` | 10 | 12 | 每个关键词的候选数 |
| `match_rerank_limit` | 8 | 10 | 候选池健康后再扩大 |
| `match_rrf_k` | 无 | 60 | RRF 平滑参数 |
| `match_query_max` | 无 | 3 | 最多 3 条短 query |
| `match_filter_penalty` | 无 | 0.95 | 每放宽一级的 fit 惩罚 |
| `match_cache_version` | 无 | v2 | 缓存 key 版本 |
| `match_group_recall_enabled` | 无 | true | 分组召回开关 |

新增配置需要同步四处：

- `llm-service/app/core/config.py`
- `docker-compose.yml`（`llm-service` 与 `ingest-worker` 两处）
- `.env.example`
- `README.md` 环境变量表

---

## 8. 实施步骤

### 阶段 0：基线与观测（不改行为）

1. 跑索引覆盖率 SQL，确认 README 入库比例。
2. 清空 `match:*` 缓存，运行现有评测：
   ```bash
   cd llm-service
   uv run python -m tests.eval.run_eval --limit 10
   ```
3. 把真实结果写入 `doc/eval/judge40-final.md`，冻结基线。
4. 在 `MatchRunner` 增加 `match_recall_stats` 日志。
5. 给评测脚本增加 `--no-cache` 或清缓存步骤。

### 阶段 1：P0（不重建索引）

| 文件 | 改动 |
| --- | --- |
| `llm-service/app/clients/vector.py` | 新增 `search_groups` 与 `VectorGroup` |
| `llm-service/app/graphs/match_graph.py` | 分组召回、多查询、RRF、过滤阶梯、关键词融合、日志 |
| `llm-service/app/schemas/match.py` | `Requirement` 增加 `search_query` |
| `llm-service/app/core/config.py` | 新增召回与融合配置 |
| `backend/.../service/RepoService.java` | `searchForAi` 增加 topics LIKE |
| `llm-service/tests/eval/run_eval.py` | 增加 `--no-cache` |
| `docker-compose.yml`、`.env.example`、`README.md` | 同步新配置 |

### 阶段 2：P1（可选，需重建索引）

1. 给 README chunk 增加短上下文头；
2. 评估是否增加 profile 向量；
3. 新建 `repo_chunks_bge_m3_v2`；
4. 全量重建，切换读流量；
5. 重跑评测，对比阶段 1。

---

## 9. 测试与验收

### 9.1 自动化检查

```bash
cd backend
mvn -q package

cd llm-service
uv run ruff check
uv run pytest
```

### 9.2 评测命令

```bash
cd llm-service

# 语义匹配
uv run python -m tests.eval.run_eval --limit 10

# 深度对比
uv run python -m tests.eval.run_compare_eval
```

### 9.3 验收标准

- recall@10 相对基线提升 ≥ 15%，或达到 0.80 以上；
- “至少命中 1 个”的比例不低于基线；
- MRR@10 下降不超过 5%（相对值）；
- match P95 不因多查询和分组召回上升超过 20%；
- 对比证据覆盖率不低于基线；
- `uv run ruff check`、`uv run pytest`、`mvn -q package` 通过；
- 所有新配置已同步四处。

### 9.4 新增测试建议

| 测试 | 内容 |
| --- | --- |
| 分组召回 | 用 fake VectorStore 断言 `limit` 表示仓库数，`group_size` 保留证据 |
| RRF 融合 | 给定两路排名，断言融合顺序与分数归一化 |
| 过滤阶梯 | 断言 L0 → L1 → L2 的触发条件与 `relaxed` 记录 |
| 查询构造 | 断言最多 3 条 query、去重、空字段处理 |
| 缓存版本 | 断言新版本号生效，旧缓存不再命中 |

---

## 10. 风险与回滚

| 风险 | 表现 | 应对 |
| --- | --- | --- |
| 分组召回参数不兼容 | 旧 Qdrant / 客户端报错 | 捕获异常并回退到 `search()` + 聚合 |
| RRF 分数不可解释 | 前端展示的 semantic 变化 | 保留原始 cosine 到日志，前端只展示 0–1 归一化值 |
| 过滤放宽过多 | 结果与需求无关 | 只放宽分类/许可，语言/平台不放宽；fit 惩罚 + 风险提示 |
| 多查询增加延迟 | match P95 上升 | 限制最多 3 条 query，batch embedding，串行 Qdrant 查询 |
| 缓存命中旧结果 | 评测看不出变化 | 缓存 key 加版本号，评测前清 `match:*` |
| 索引覆盖率不足 | 召回始终偏低 | 阶段 0 先跑覆盖率 SQL，不达标先修索引 |

回滚开关：

| 开关 | 默认 | 用途 |
| --- | --- | --- |
| `MATCH_GROUP_RECALL_ENABLED` | `true` | 关闭后回退到旧 `search()` 聚合 |
| `MATCH_PIPELINE_VERSION` | `v2` | 缓存 key 版本，便于失效旧缓存 |
| `QDRANT_COLLECTION` | 旧集合 | 切换到 `repo_chunks_bge_m3_v2` 时使用 |

---

## 附录 A：代码位置索引

| 内容 | 位置 |
| --- | --- |
| 匹配召回主流程 | `llm-service/app/graphs/match_graph.py` |
| 向量检索与过滤 | `llm-service/app/clients/vector.py` |
| 召回配置 | `llm-service/app/core/config.py`（`match_*`） |
| README 分块 | `llm-service/worker/chunk.py` |
| 索引写入 | `llm-service/worker/index.py` |
| 索引流水线 | `llm-service/worker/pipeline.py` |
| 文档证据工具 | `llm-service/app/tools/doc_tools.py` |
| 对比编排 | `llm-service/app/graphs/compare_graph.py` |
| 仓库检索 | `backend/src/main/java/com/githubstars/service/RepoService.java` |
| 建表脚本 | `deploy/init.sql`（`repo_documents`） |

## 附录 B：验收清单

- [ ] 阶段 0 基线已生成，指标来自真实运行。
- [ ] 索引覆盖率已确认，README 入库比例可解释。
- [ ] 分组召回生效，日志能看到 `vector_groups` 与 `pool_size`。
- [ ] recall@10 相对基线提升 ≥ 15%，或达到 0.80 以上。
- [ ] MRR@10 未下降超过 5%。
- [ ] 过滤放宽有记录、有风险提示、有 fit 惩罚。
- [ ] 关键词通道包含 topics，且参与 RRF。
- [ ] 匹配缓存已加版本号，评测前已清缓存。
- [ ] 对比链路证据覆盖率不低于基线。
- [ ] 回滚开关可用，旧集合保留。
- [ ] `mvn -q package`、`uv run ruff check`、`uv run pytest` 全部通过。

---

## 11. 实施记录（v2.0，2026-11-13）

### 11.1 最终生效的召回链路

```text
用户原文
  → 缓存探测（match:{MATCH_CACHE_VERSION}:{user}:{digest}）
  → 需求结构化（goal / search_query / must / should / exclude / keywords）
  → 硬条件提取（platform / language / license / category / min_stars / active_within_days）
  → 构造 2–3 条短 query
  → 批量 embedding（bge-m3，1024 维）
  → Qdrant 分组召回（group_by=repo_id，limit=60，group_size=2）
  → 关键词召回（backend LIKE，含 topics，每词 12 条）
  → 通道内线性衰减融合（decay=0.02）
  → 交叉编码 rerank（bge-reranker-v2-m3，全池，原始分）
  → 候选补全 + active_within_days / exclude 后过滤
  → semantic 主排序，fit 次级排序
  → topK + 缓存 + match_recall_stats
```

### 11.2 与 v1.0 方案的差异

| 项 | v1.0 方案 | v2.0 实际实施 |
| --- | --- | --- |
| 召回单位 | 分组召回 `repo_id` | 保留，`MATCH_RECALL_LIMIT=60` 表示仓库数 |
| 多查询 | `search_query` + 2–3 条短 query | 保留 |
| 融合 | RRF（`k=60`，按理论最大值归一化） | 改为通道内线性衰减：`max(0, 1 - 0.02×(rank-1))`，多路求和后除以通道数 |
| 关键词 | 固定 0.35 → 真实排名 | 保留参与融合，topics 已加入 LIKE |
| 过滤放宽 | L0→L3 分级放宽 + fit 惩罚 | **删除**：严格按硬条件召回，不放宽、不兜底 |
| 重排 | LLM 重排 top10，`delta ∈ [-0.1, 0.1]` | **删除**；改为交叉编码 rerank 全池打分（`BAAI/bge-reranker-v2-m3`，复用 embedding Key） |
| 语义分 | `semantic = rrf` | `semantic = 0.6 × rerank_raw + 0.4 × 线性融合分`，不再 min-max |
| 排序主键 | `fit` 降序 | `semantic` 降序，`fit` 仅在同语义时次级排序 |
| fit 公式 | `0.45/0.25/0.15/0.15`（含 license） | `0.70×semantic + 0.15×coverage + 0.15×maintenance`，license 移出打分 |
| 兜底 | 向量/关键词为空时按热度兜底 | **删除**：召回为空直接返回空结果 |
| 评测口径 | 标注 fullName 精确匹配 | LLM-as-Judge 为主口径，标注命中降为参考 |
| 数据集 | 24 条 / 70 个标注 | 21 条 / 43 个标注，仅保留库内真实存在的仓库 |

### 11.3 实测结果

数据集为改造前的 24 条（70 个标注仓库，其中 43 个在库，平均理论上限约 0.597）。三组使用同一数据集与同一 Judge：

| 配置 | 至少 1 个 match | 严格相关率@10 | Judge MRR | 标注 recall@10 | 平均耗时 |
| --- | --- | --- | --- | --- | --- |
| 旧基线（仅标注口径） | — | — | — | 0.125 | 9.7s |
| P0：分组召回 + RRF + LLM 重排 | 14/24 | 0.108 | 0.420 | 0.181 | 11.3s |
| 对照：分组召回 + RRF，无 rerank | 12/24 | 0.079 | 0.240 | 0.111 | 4.6s |
| 当前：分组召回 + 线性融合 + 交叉编码 rerank | 14/24 | 0.100 | 0.338 | 0.181 | 5.6s |

结论：

1. 交叉编码 rerank 相对无 rerank 对照，严格相关率 +26.6%、MRR +40.8%、标注 recall +63%，有效。
2. 与已删除的 LLM 重排相比，召回能力持平（0.100 vs 0.108、recall 均 0.181），MRR 略低（0.338 vs 0.420），但平均耗时从 11.3s 降到 5.6s，且不再消耗 LLM token。
3. 候选池 recall 0.333–0.375，top10 严格相关率仅 0.10，**排序仍是主要瓶颈**。
4. 旧数据集中 27/70 个标注仓库不在库，`newsletter`、`labeling`、`api-mock` 三个用例无法命中；已从数据集剔除。

### 11.4 变更文件

| 模块 | 文件 |
| --- | --- |
| 向量召回 | `llm-service/app/clients/vector.py`（`search_groups` / `VectorGroup`） |
| 交叉编码 rerank | `llm-service/app/clients/rerank.py` |
| 召回与排序 | `llm-service/app/graphs/match_graph.py` |
| 契约 | `llm-service/app/schemas/match.py`（`search_query`；移除 `RerankItem`、`Candidate.fitted`、`breakdown.license`） |
| 配置 | `llm-service/app/core/config.py` |
| 匹配路由 | `llm-service/app/api/match.py` |
| 仓库检索 | `backend/src/main/java/com/githubstars/service/RepoService.java`（topics LIKE） |
| 评测 | `llm-service/tests/eval/run_eval.py`、`judge.py`、`dataset.jsonl` |
| 前端 | `frontend/lib/match.ts`、`components/fit-meter.tsx`、`components/match/CandidateCard.tsx`、`components/sample-dossier.tsx` |
| 部署配置 | `docker-compose.yml`、`.env.example`、`README.md` |

### 11.5 质量门禁

- `uv run ruff check` 通过
- `uv run pytest` 72 passed
- `mvn -q package` 通过（RepoService topics LIKE）
- `npx tsc --noEmit` 通过
- 线上评测使用一次性容器，常驻容器未重启；临时容器、含密钥的 env 文件已清理

### 11.6 待办

1. 用 21 条新数据集复测，建立 v2.0 基线（当前报告基于 24 条旧数据集，不可直接对比）。
2. 调优 rerank：当前原始分直接融合，权重 0.6 偏大；建议对比 0.4 / 0.6，或改为 rank 融合。
3. 继续修排序：`document-ocr`、`team-chat` 在 rerank 开启后出现退化，需要单用例诊断。
4. 扩充语料：优先补齐数据集涉及但未入库的仓库，再谈 recall 上限。
5. P1（chunk 上下文头 / 仓库 profile 向量）暂不执行，等 v2.0 基线出来再判断。
6. 上线时把 `MATCH_CACHE_VERSION` 从 `v2` 提到 `v3`，失效旧排序缓存。

---

## 12. 当前实现（v2.1，2026-11-14）

### 12.1 最终生效的召回链路

```text
用户原文
  → 缓存探测（match:v5:{user}:{digest}）
  → 需求结构化（search_query / must / should / exclude / keywords）
  → 英文 query 兜底（缺失或含中文时由模型改写/翻译，绝不回退中文 query）
  → 英文语义召回：Qdrant 分组召回（group_by=repo_id，limit=60，group_size=2）
  → 英文关键词召回：backend RepoBm25Index（name / topics / description，每词最多 60）
  → 双路加权 RRF（向量 0.5 + 关键词 0.5，k=60）→ 只保留前 60
  → 交叉编码 rerank（bge-reranker-v2-m3，semantic 取原始分）
  → semantic 主排序，fit 次级排序
  → topK + 缓存 + match_recall_stats
```

### 12.2 与 v2.0 的差异

| 项 | v2.0 | v2.1 实际实现 |
| --- | --- | --- |
| Query | 中英双语 2–3 条短 query | 英文单路；中文提问先改写/翻译为英文 |
| 召回 | 中文语义 + 英文语义 + 关键词 | 英文向量 + 英文 BM25 两路 |
| 融合 | 通道内线性衰减，取消 RRF | 双路加权 RRF，各 0.5，`k=60` |
| rerank 候选 | 全池 | RRF 前 60 |
| 关键词检索 | backend SQL LIKE + topics | `RepoBm25Index`（BM25，5 分钟快照） |
| README 入库 | 原文直接入库 | 非英文 README 先翻译为英文，`repo_documents.lang` 标记 0/1/2 |
| 缓存版本 | `v2` | `v5` |

### 12.3 实测结果（Provisional）

条件：21 条冻结需求、`limit=10`、关闭匹配缓存、`MATCH_RECALL_LIMIT=60`、LLM-as-Judge。
评测期间全量索引重建与 README 翻译回填仍在进行，结果仅作阶段性参考。

| 指标 | RRF 50/50 + Top60 | 历史 no-RRF 参考 |
| --- | --- | --- |
| 至少 1 个相关（match） | 17 / 21 | 18 / 21 |
| 平均严谨相关率@10 | 0.143 | 0.152 |
| 平均首个相关排名（MRR） | 0.506 | 0.621 |
| 平均 recall@10 | 0.317 | 0.444 |
| 候选池 recall（池=60） | 0.579 | 0.762（旧池更大） |

报告与数据：该轮中间报告已随迭代清理，结论并入 `doc/eval/judge40-final.md` 的迭代过程表。

### 12.4 变更文件

| 模块 | 文件 |
| --- | --- |
| 召回与 RRF | `llm-service/app/graphs/match_graph.py` |
| Query 清洗 | `llm-service/app/services/query_terms.py` |
| 契约 | `llm-service/app/schemas/match.py`（移除 `search_query_zh`） |
| 配置 | `llm-service/app/core/config.py`（`match_cache_version=v5`） |
| README 翻译 | `llm-service/worker/lang_detect.py`、`worker/translate.py`、`worker/pipeline.py` |
| 关键词检索 | `backend/src/main/java/com/githubstars/service/RepoBm25Index.java`、`RepoService.java` |
| 文档字段 | `deploy/init.sql`（`repo_documents.lang` / `lang_checked_at`） |
| 评测 | `llm-service/tests/eval/run_eval.py`、`doc/eval/judge40-final.md` |

### 12.5 质量门禁

- `ruff check` 通过
- `pytest` 84 passed
- `mvn -q package` 通过
- 服务器一次性容器评测通过，常驻容器未因评测重启
