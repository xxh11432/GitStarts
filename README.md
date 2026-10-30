<div align="center">

# GitStarts

**描述你的想法，找到能直接用上的开源项目**

从「GitHub 热门仓库聚合」升级为「输入想法 → 匹配开源项目 → AI 深读 → 横向对比 → 决策沉淀」的开源方案决策平台

[![在线体验](https://img.shields.io/badge/🌐_在线体验-www.gitstars.cn-ff4fa3?logo=googlechrome&logoColor=white)](https://www.gitstars.cn/)
[![Java](https://img.shields.io/badge/Java-17-orange?logo=openjdk&logoColor=white)](https://openjdk.org/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.5-6DB33F?logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)

</div>

---

## 这是什么

GitStarts 起初是一个 GitHub 热门仓库聚合站：定时采集仓库的 star / fork / 语言 / topics，提供榜单、搜索与详情。

现在它正在演进为一个**开源方案匹配与对比平台**：

> 我有一个想法，但不知道有没有现成的开源项目 —— 用自然语言描述需求，拿到高契合度候选；候选太多不知道选哪个 —— 让 AI 读项目，按统一维度做横向对比，并为每个结论附上证据。

## 解决什么问题

| 痛点 | GitStarts 的做法 |
|---|---|
| 想法有了，不知道搜什么关键词 | 自然语言 → 需求结构化（硬条件 / 软偏好 / 排除项） |
| 候选太多，只看 star 不靠谱 | 语义召回 + 硬过滤 + 重排，输出**可解释的契合度分解**，而不是一个魔法分 |
| 关心「能不能用到我的场景」 | 部署方式、许可证、平台、活跃度可过滤、可解释 |
| 选型过程难以复盘 | 收藏、对比历史、会话记录、Markdown 导出 |

## 核心流程

```mermaid
flowchart LR
    A[输入想法] --> B[需求结构化]
    B --> C[硬过滤<br/>平台 / 语言 / 许可 / 活跃度]
    C --> D[向量召回<br/>Qdrant top 40]
    D --> E[关键词补充<br/>+ LLM 重排]
    E --> F[候选清单 3-10<br/>含契合度分解]
    F --> G[选 2-4 个深读]
    G --> H[对比矩阵<br/>逐格证据]
    H --> I[结论建议 / 收藏 / 导出]

    style A fill:#e3f2fd,color:#0d47a1
    style F fill:#e8f5e9,color:#1b5e20
    style H fill:#fff3e0,color:#e65100
    style I fill:#f3e5f5,color:#6a1b9a
```

契合度不再是一个不可解释的分数，而是显式分解：

```
fit = 0.45 × 语义相关
    + 0.25 × 硬条件覆盖（must 命中率）
    + 0.15 × 维护活跃度（pushed_at / star 增速 / 是否 archived）
    + 0.15 × 许可证与生态适配
```

## 核心能力（规划）

- **需求结构化**：只抽取用户明说的条件，不确定项降级为软偏好，禁止臆造许可证与部署方式。
- **混合召回**：MySQL 硬过滤 → Qdrant 向量召回 → 关键词补充 → LLM 重排（只允许 ±0.1 调整并给出理由）。
- **AI 深读**：按 Markdown 标题切分 README、清洗后入索引，回答基于 `[TOOL_DATA]` 与段落证据。
- **逐格证据对比**：8 个固定维度（定位 / 技术栈 / 部署 / 能力覆盖 / 许可 / 活跃度 / 扩展性 / 风险），每个单元格标注证据或「信息不足」。
- **成本与配额**：普通用户 30 次对话 + 3 次深度对比每天；对比结果按文档版本缓存 7 天。
- **可观测**：模型、token、延迟、工具调用全链路记录，日用量汇总与告警。

## 当前进度

**已实现**

- GitHub 采集：分层发现式全量（高星基石 → 近期活跃 → 近期热点 → 语言补齐，默认目标 2000 个仓库）、定时增量同步、令牌桶限流、Redis 分布式锁、采集日志
- 查询 API：仓库列表（搜索 / 平台 / 语言 / 分类 / 许可 / 排序 / 分页）、详情、相关推荐、README 摘要、榜单、聚合元数据、健康检查
- 前端：首页、仓库档案库、仓库详情、语义匹配、深度对比、个人中心（Next.js App Router + Tailwind + shadcn/ui）
- 部署：Docker Compose 编排 MySQL / Redis / 后端 / 前端 / Nginx
- 缓存：热点数据 Redis 缓存
- **M0 工程基座**：`llm-service`（FastAPI + structlog + requestId）、`ingest-worker`、Qdrant、Nginx `/ai/` 与 `/api/internal/` 隔离、新视觉设计令牌与首页骨架
- **M1 账号会话与配额**：GitHub OAuth 登录闭环、Spring Session Redis（7 天）、每日配额 MySQL 原子扣减 + 幂等账本、`/ai/**` 未登录 401（Nginx auth_request）、登录页与 `/me`、`/compare` 路由保护
- **M2 仓库数据补强**：`platform` 规则推导与筛选、许可证与更新时间筛选、详情页 README 摘要与相关推荐、首页平台/统计模块、列表与详情新视觉及移动端筛选抽屉
- **M3 AI 对话 MVP**：`/ai/chat/stream` SSE 流式（`meta` / `status` / `tool` / `repos` / `delta` / `done` / `error`）、工具调用（`search_repos` / `get_repo` / `get_rank`）、首页对话与仓库卡、会话与消息异步落库
- **M4 语义索引与匹配**：README 抓取清洗（ETag 条件请求 + 退避）→ 标题分块 → fastembed embedding → Qdrant 幂等写入；全量首建与增量调度（Redis 锁、游标续跑）；`/ai/match` SSE（结构化 → 硬过滤 → 向量召回 + 关键词补充 → LLM 重排 ±0.1 → 四维契合度）；`ideas` 落库与条件编辑；`/match` 匹配工作台；离线评测数据集与 `recall@10` 报告脚本
- **M5 深读与对比工作台**：关键 manifest 抓取入索引；`/ai/compare` SSE（`plan` / `cell` / `verdict` / `done` / `error`）；8 维逐格证据与「信息不足」兜底；单仓失败降级不拖垮整体；Redis checkpoint（1h）断流续跑 + 结果缓存（7 天，命中不计费）；`comparisons` 落库、历史与只读分享链接；`/compare` 工作台（差异高亮、证据抽屉、Markdown 导出）与 `/compare/s/{token}` 分享页
- **M6 个性化沉淀**：收藏与备注（`favorites`，跨会话一致）；`/me` 完整化（配额、想法、对比、收藏、会话入口）；对比历史 / 想法 / 会话历史的列表与详情；技能 / 兴趣 / 偏好画像与规则推荐位；对比分享链接可撤销、记录可删除；账号删除时清理全部个人数据
- **M7 上线打磨**：请求级 `ai_metrics`（token / 延迟 / 结果）与 `/ops` 成本看板、分类型 P95 与预算告警；README 抓取 SSRF 白名单；后端依赖补丁与 OSV 复检脚本；前端升级 Next.js 16 + React 19（`npm audit` critical/high 归零）；Nginx 静态缓存 / 安全响应头 / 按 IP 限流 / 关闭图片优化器；Redis AOF 与容器健康检查；跳过链接、表格语义与减少动效；部署 / 运维 / 评测 / 故障预案手册与 HTTPS 示例
- **体验与可观测性增强**：仓库补充多平台 `platforms` 与最新 Release（GraphQL 批量刷新）；`X-Request-Id` 贯穿 Nginx / backend / llm-service 日志；embedding 启动预热、对比缓存先于配额判断；前端升级为 shadcn/ui + Radix 组件体系，新增 `⌘K` 命令面板、移动端导航、跨页对比篮（最多 4 个）与匹配 / 对比工作台状态恢复
- **活跃度采集与排序**：`heat_score`（Star 体量 × 近期推送衰减）随采集更新、启动时回填；`/repos?sort=active`、排行榜「活跃综合榜」与筛选器均支持

**已上线**

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 工程基座与视觉系统：`llm-service` 骨架、Qdrant、Nginx `/ai/` 与内部接口隔离 | 已完成 |
| M1 | GitHub OAuth、会话（Spring Session）、每日配额原子扣减 + 幂等账本 | 已完成 |
| M2 | 仓库数据补强：`platform` 字段、许可与更新时间筛选、相关推荐 | 已完成 |
| M3 | AI 网关与对话 MVP：SSE 流式、工具调用（`search_repos` / `get_repo` / `get_rank`） | 已完成 |
| M4 | 语义索引与匹配：README 分块 embedding、召回重排、`/ai/match` | 已完成 |
| M5 | 深读与对比工作台：逐维度证据、结论建议、缓存与导出 | 已完成 |
| M6 | 个性化沉淀：收藏、历史、画像、分享链接 | 已完成 |
| M7 | 上线打磨：压测、成本看板、安全复检、可访问性 | 已完成 |
| M8 | 提升检索精度 | 进行中... |

## 架构

```mermaid
flowchart TB
    subgraph FE[Next.js 16]
        P[首页 / 匹配 / 对比 / 详情 / 个人中心]
    end

    N[Nginx :80]

    subgraph SVC[Spring Boot]
        B[backend :8080<br/>账号 / 配额 / 业务数据 / 仓库检索]
        L[llm-service :8081<br/>需求结构化 / 召回重排 / SSE]
    end

    M[(MySQL 8)]
    R[(Redis 7)]
    Q[(Qdrant)]
    W[ingest-worker<br/>抓取 → 清洗 → 分块 → embedding]
    G[GitHub API]
    LLM[模型供应商<br/>OpenAI 兼容]

    P --> N
    N -->|/api| B
    N -->|/ai| L
    L -->|内部接口| B
    B --> M
    B --> R
    L --> Q
    L --> LLM
    W --> G
    W --> B
    W --> Q

    style B fill:#e8f5e9,color:#1b5e20
    style L fill:#e3f2fd,color:#0d47a1
    style Q fill:#fff3e0,color:#e65100
```

分层职责是硬约束，用来防止耦合回潮：

| 服务 | 负责 | 不允许 |
|---|---|---|
| `frontend` | 页面、SSE 消费、流式渲染 | 持有模型 Key、拼 prompt、直连向量库 |
| `backend` | 账号、配额、持久化、仓库检索（唯一数据出口） | 引入模型 SDK、感知 prompt 与模型厂商 |
| `llm-service` | 唯一模型出口、prompt、工具编排、重排、SSE | 直连 MySQL、判断业务权限 |
| `ingest-worker` | 抓取、清洗、分块、embedding、写索引；经 backend 内部接口读写文档元数据 | 直连 MySQL、对外提供业务 API |
| `alert-worker` | 巡检容器状态与 ERROR 日志，异常时推送飞书卡片 | 承载业务流量、直连业务库 |

## 技术栈

| 层 | 选型 |
|---|---|
| 后端 | Java 17 · Spring Boot 3.5 · MyBatis-Plus |
| AI 网关 | Python 3.12 · FastAPI · LangGraph · langchain-openai |
| 认证 | Spring Security · OAuth2 Client · Spring Session Redis |
| 存储 | MySQL 8 · Redis 7 · Qdrant 1.x |
| 前端 | Next.js 16（App Router）· React 19 · TypeScript · Tailwind CSS · shadcn/ui（Radix UI） |
| 模型 | OpenAI 兼容协议（默认 HiModels：DeepSeek V4 Flash）；embedding 本地 fastembed（1024 维多语言模型），可切供应商 API |
| 部署 | Nginx · Docker Compose |

## 快速开始

环境要求：Docker + Docker Compose；本地开发另需 JDK 17、Maven 3.9+、Node.js 20.9+（Next.js 16 要求）、Python 3.12 + uv。

```bash
git clone https://github.com/xxh11432/GitStarts.git
cd GitStarts
cp .env.example .env
# 编辑 .env：MySQL / Redis 密码，GITHUB_TOKEN（提升 API 限流），LLM_API_KEY（对话）
# EMBEDDING_API_KEY（硅基流动，用于 embedding）；INTERNAL_TOKEN 必填，用 `openssl rand -hex 32` 生成
# 留空 INTERNAL_TOKEN 时 backend 内部接口一律 503，AI 对话 / 匹配 / 对比均不可用
docker compose up -d --build
```

embedding 默认调用硅基流动的 `/v1/embeddings`（`BAAI/bge-m3`，1024 维），
llm-service 与 worker 进程内不再加载 ONNX 模型，两个容器常驻内存合计约 250 MB。
离线部署需要本地模型时，设 `EMBEDDING_PROVIDER=fastembed` 并显式把模型预置到 `model-cache` 卷。
更换 embedding 模型必须重建 Qdrant 索引：换成新的 `QDRANT_COLLECTION`，worker 会按集合名自动做一次全量重建。

> 从 M6 升级到 M7 时，已有数据库需补 `ai_metrics` 表（新库由 `deploy/init.sql` 直接创建）：
> 重跑 `deploy/init.sql` 即可（`CREATE TABLE IF NOT EXISTS`，重复执行无副作用）。
>
> 从 M6 升级到当前版本时，已有数据库需补 `repositories.platforms`、`latest_release_tag`、`latest_release_at`、`release_checked_at` 四列：
> 重跑 `deploy/init.sql` 即可，脚本内置幂等补列存储过程，重复执行无副作用。
>
> 从 M5 升级到 M6 时，已有数据库需补 `favorites` 表（新库由 `deploy/init.sql` 直接创建，无需执行）：
> 重跑 `deploy/init.sql` 即可（全部为 `CREATE TABLE IF NOT EXISTS`）。
>
> 从 M4 升级到 M5 时，已有数据库需补 `comparisons` 表（新库由 `deploy/init.sql` 直接创建，无需执行）：
> 重跑 `deploy/init.sql` 即可（全部为 `CREATE TABLE IF NOT EXISTS`）。
>
> 从 M3 升级到 M4 时，除重跑 `deploy/init.sql` 建 `ideas` / `repo_documents` 外，
> 已有 `repositories` 表需要补两列（全新初始化可跳过）：
>
> ```sql
> ALTER TABLE repositories
>   ADD COLUMN readme_sha VARCHAR(64) COMMENT 'README blob sha',
>   ADD COLUMN docs_indexed_at DATETIME COMMENT '最近完成索引时间';
> ```
>
> 然后在 `.env` 打开 worker（`INDEX_ON_STARTUP=true`），首次启动会自动构建 README 索引。
>
> 从 M1 升级到 M2 时，已有数据库需补 `repositories.platform` 列与索引（新库由 `deploy/init.sql` 直接创建，无需执行）：
> `docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "ALTER TABLE repositories ADD COLUMN platform VARCHAR(32) NULL AFTER category, ADD INDEX idx_platform(platform), ADD INDEX idx_pushed_at(pushed_at)"'`。
> 平台字段在应用启动时会为存量仓库自动回填。
>
> 从 M2 升级到 M3 时，已有数据库需补会话与消息表（新库由 `deploy/init.sql` 直接创建，无需执行）：
> `docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < /docker-entrypoint-initdb.d/init.sql'` 可重跑建表脚本（全部为 `CREATE TABLE IF NOT EXISTS`）。
>
> 从 M0 升级到 M1 时，已有 MySQL 数据卷不会自动执行新增表；可在 `.env` 填入 GitHub OAuth App 的
> `AUTH_GITHUB_CLIENT_ID` / `AUTH_GITHUB_CLIENT_SECRET`，回调地址设为 `http://<host>/api/auth/github/callback`。

启动后访问 `http://localhost`（Nginx → 前端，`/api/` 反代到后端，`/ai/` 反代到 llm-service）。`/api/internal/**` 对外直接 404。

```bash
curl http://localhost/ai/health   # {"status":"ok|degraded", ...}
```

本地开发：

```bash
# 后端
cd backend
mvn spring-boot:run

# 前端
cd frontend
npm install
npm run dev

# AI 网关（8081）
cd llm-service
uv sync
uv run uvicorn app.main:app --reload --port 8081

# 索引 worker（M4：全量首建 → 定时增量）
cd llm-service
uv run python -m worker
```

首次启动 worker 会自动全量索引已采集仓库的 README（可设 `INDEX_MAX_REPOS=50` 先小样本验证）；
完成后每 `INDEX_INTERVAL_MINUTES` 分钟扫描 `pushed_at` 变化，按 ETag 条件请求跳过未变更 README。
中断后可从 Redis 游标续跑；同一时间只允许一个 worker 持锁执行。

关键环境变量：

| 变量 | 说明 |
|---|---|
| `GITHUB_TOKEN` | GitHub PAT，用于提升 Search / REST 限流 |
| `SYNC_ENABLED` | 是否启用定时采集，本地开发可设 `false` |
| `SYNC_MAX_REPOS` / `SYNC_INCREMENTAL_BATCH` | 仓库总量目标（默认 2000）/ 每小时增量刷新数（默认 200） |
| `SYNC_ACTIVE_DAYS` / `SYNC_LANGUAGE_BATCH` | 活跃判定天数（默认 90）/ 每种语言补齐上限（默认 100） |
| `SYNC_RELEASE_REFRESH` | 每日 Release 刷新上限（默认 2000） |
| `AUTH_GITHUB_CLIENT_ID` / `AUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth App 凭据；回调地址填 `http://<host>/api/auth/github/callback` |
| `AUTH_GITHUB_REDIRECT_URI` / `APP_FRONTEND_URL` | 回调地址与登录成功后的前端回跳地址 |
| `SESSION_COOKIE_SECURE` | 会话 Cookie 是否仅 HTTPS 发送；生产开启，本地 HTTP 需为 `false` |
| `QUOTA_CHAT_DAILY` / `QUOTA_COMPARE_DAILY` | 每日对话 / 深度对比额度（默认 30 / 3） |
| `QUOTA_TOKEN_DAILY` | 单用户日 token 成本预算（默认 200000，0 表示关闭阻断） |
| `QUOTA_TOKENS_PER_UNIT` | 加权计费：每 N tokens 追加消耗 1 次额度（默认 8000，0 表示纯按次数计） |
| `QUOTA_REAPER_*` / `QUOTA_LEDGER_RETENTION_DAYS` | 超时预留回收阈值与账本保留天数 |
| `API_INTERNAL_URL` | 前端 SSR 访问后端的内部地址 |
| `LLM_BASE_URL` / `LLM_API_KEY` | 模型网关地址与密钥（仅 llm-service 可见） |
| `LLM_CHAT_MODEL` / `LLM_EMBEDDING_MODEL` | 对话与向量模型（默认 DeepSeek V4 Flash 对话 + 硅基流动 `BAAI/bge-m3`） |
| `LLM_THINKING_MODE` | 思考模式：`auto`（不传参数）/ `enabled` / `disabled`（默认，避免 reasoning 挤占正文） |
| `EMBEDDING_PROVIDER` | `api`（默认，硅基流动）或 `fastembed`（本地离线备用） |
| `EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY` | embedding 供应商地址与密钥，独立于对话供应商；留空时回落到 `LLM_BASE_URL` / `LLM_API_KEY` |
| `EMBEDDING_BATCH_SIZE` | 单次 embedding 请求文本数（默认 16，受供应商批量上限与限流约束） |
| `QDRANT_ON_DISK` | 向量是否落盘（默认 `true`，低内存部署必开；仅对新建集合生效） |
| `QDRANT_HNSW_MEMORY` | HNSW 图的内存策略 `cold` / `cached` / `pinned`（默认 `pinned`，图常驻内存避免查询随机读盘） |
| `QDRANT_QUANTIZATION_ENABLED` | 是否启用 int8 标量量化（默认 `false`；2C2G 低内存部署开启后量化向量常驻、原始向量落盘做 rescore；仅对新建集合生效，已有集合需 PATCH 集合配置） |
| `QDRANT_QUANTIZATION_QUANTILE` | 标量量化分位数（默认 `0.99`） |
| `QDRANT_QUANTIZATION_MEMORY` | 量化向量的内存策略 `cold` / `cached` / `pinned`（默认 `pinned`） |
| `QDRANT_QUANTIZATION_RESCORE` | 查询是否用原始向量 rescore（默认 `true`，关闭会明显掉召回） |
| `QDRANT_QUANTIZATION_OVERSAMPLING` | rescore 过采样倍数（默认 `2.0`） |
| `PREWARM_MODELS` | 仅 `EMBEDDING_PROVIDER=fastembed` 时使用：镜像构建期内置本地模型（默认 `false`） |
| `INTERNAL_TOKEN` | 服务间调用鉴权（M0 起） |
| `BACKEND_URL` | llm-service 访问 backend 内部接口的地址（Compose 内为 `http://backend:8080`） |
| `QDRANT_URL` / `QDRANT_COLLECTION` | 向量库地址与集合名（默认 `repo_chunks`；更换 embedding 模型时使用新集合名，如 `repo_chunks_bge_m3`） |
| `INDEX_ON_STARTUP` / `INDEX_INTERVAL_MINUTES` | worker 首次是否全量、之后增量扫描间隔（分钟） |
| `INDEX_FULL_REBUILD` / `INDEX_MAX_REPOS` | 强制重扫全部仓库 / 小样本仓库数上限（0 为不限） |
| `MATCH_RECALL_LIMIT` / `MATCH_RERANK_LIMIT` | 向量召回条数 / LLM 重排候选数（默认 40 / 8） |
| `MATCH_CACHE_TTL_SECONDS` | 匹配结果缓存秒数（默认 600） |
| `COMPARE_EVIDENCE_TOPK` | 对比每个维度召回的 README / manifest 证据条数（默认 6） |
| `COMPARE_CACHE_TTL_SECONDS` | 对比结果缓存秒数（默认 7 天，命中不计费） |
| `COMPARE_CHECKPOINT_TTL_SECONDS` | 断流续跑 checkpoint 秒数（默认 3600） |
| `COMPARE_TIMEOUT_SECONDS` | 单次对比总超时（默认 240 秒） |
| `INDEX_MANIFESTS_ENABLED` | worker 是否抓取关键 manifest（package.json / pom.xml 等）并入索引（默认 true） |
| `OPS_GITHUB_LOGINS` | 可访问 `/ops` 成本看板的 GitHub 登录名，逗号分隔；留空时全部拒绝 |
| `OPS_DAILY_TOKEN_BUDGET` / `OPS_DAILY_COMPARE_BUDGET` | 日 token / 日对比次数预算（默认 200 万 / 200） |
| `OPS_P95_CHAT_MS` / `OPS_P95_MATCH_MS` / `OPS_P95_COMPARE_MS` | 分类型 P95 延迟告警阈值（默认 30s / 30s / 180s） |
| `GITHUB_API_BASE` / `GITHUB_ALLOWED_HOSTS` | README / manifest 抓取地址与 SSRF 主机白名单（默认仅 `api.github.com`，强制 HTTPS） |
| `GITHUB_REQUESTS_PER_MINUTE` | worker 调用 GitHub 的分钟级限速（默认 60，0 为不限）；与 backend 共享同一 Token 配额 |
| `REDIS_MAXMEMORY` | Redis 内存上限（默认 256mb）；淘汰策略固定 `volatile-lru`，只淘汰带 TTL 的缓存键 |
| `OPS_METRICS_RETENTION_DAYS` | `ai_metrics` 保留天数（默认 180，0 关闭自动清理） |
| `ALERT_WEBHOOK` / `ALERT_SECRET` | 飞书群机器人 webhook 与可选签名密钥；留空时 `alert-worker` 只巡检不推送 |
| `ALERT_ENABLED` / `ALERT_ENV` / `ALERT_INTERVAL_SECONDS` | 通知开关（默认 true）/ 卡片环境标识 / 巡检间隔（默认 60 秒） |

## 目录结构

```
GitStarts/
├── backend/                  # Spring Boot 后端
│   └── src/main/java/com/githubstars/
│       ├── collector/        # GitHub 采集、限流、调度
│       ├── controller/       # 仓库 / 元数据 / 账号 / 配额 / 内部接口
│       ├── security/         # OAuth2 登录、会话、CSRF、内部接口鉴权
│       ├── service/          # 查询、榜单、同步、缓存、用户、配额
│       ├── mapper/ entity/   # MyBatis-Plus
│       └── config/           # Redis、线程池、调度、请求 ID（X-Request-Id → MDC）
├── frontend/                 # Next.js 16
│   ├── app/                  # 首页 / 仓库 / 匹配 / 登录 / 个人中心 / 对比 / 只读分享页
│   ├── components/           # Navbar / CommandMenu / MobileNav / RepoCard / ui/（shadcn 基础组件）
│   │   ├── match/            # 条件编辑、候选卡、契合度与证据
│   │   └── compare/          # 对比矩阵、证据抽屉、对比篮
│   └── lib/                  # API 封装、SSE 客户端、会话与 CSRF、对比篮 / 工作台状态、类型
├── llm-service/              # Python AI 网关（API 与 worker 复用同一镜像）
│   ├── app/                  # FastAPI：api / core / clients / graphs / tools / services / schemas
│   ├── worker/               # python -m worker：fetch_docs / chunk / embed / index / pipeline
│   ├── tests/                # pytest + tests/eval（匹配评测数据集与脚本）
│   ├── pyproject.toml        # uv 依赖与 ruff / pytest 配置
│   ├── docker-entrypoint.sh  # 启动时检查 model-cache 卷，命中则离线加载 embedding
│   └── Dockerfile            # 多阶段构建
├── deploy/init.sql           # MySQL 建表与初始化（含幂等补列存储过程）
├── deploy/alerting/alertd.py # 异常日志通知：容器状态 + ERROR 日志 → 飞书卡片
├── nginx/nginx.conf          # 反向代理（/api/、/ai/、内部接口隔离、X-Request-Id 透传）
├── doc/                      # 技术方案、差异化功能方案、eval 报告
└── docker-compose.yml
```

## API 概览

现有接口（前缀 `/api`）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/repos` | 列表：搜索 / 平台 / 语言 / 分类 / 许可 / 排序（stars·forks·pushedAt·created）/ 分页 |
| GET | `/api/repos/rank` | 榜单（total / trend / new） |
| GET | `/api/repos/similar/{fullName}` | 相关推荐：topics 重合、语言 / 平台 / 分类匹配、star 接近度 |
| GET | `/api/repos/{owner}/{repo}/readme` | README 纯文本摘要（按需读取 GitHub 并缓存，失败时返回空摘要） |
| GET | `/api/repos/{fullName}` | 仓库详情 |
| GET | `/api/meta` | 分类、语言、标签、平台聚合 |
| GET | `/api/auth/github/login` | 发起 GitHub 登录，支持 `next` 回跳 |
| GET | `/api/auth/me` | 当前登录用户与今日配额（未登录 401） |
| POST | `/api/auth/logout` | 退出登录（需 CSRF token） |
| GET | `/api/quota` | 今日对话 / 对比配额（未登录 401） |
| POST | `/api/ideas` | 保存想法与结构化条件（登录 + CSRF） |
| GET | `/api/ideas` | 我的想法分页列表 |
| GET | `/api/ideas/{id}` | 想法详情（仅本人） |
| PATCH | `/api/ideas/{id}` | 编辑标题或结构化条件（仅本人，需 CSRF） |
| GET | `/api/comparisons` | 我的对比历史（分页） |
| GET | `/api/comparisons/{id}` | 对比详情（仅本人） |
| POST | `/api/comparisons/{id}/share` | 生成（或复用）只读分享 token（仅本人，需 CSRF） |
| POST | `/api/comparisons/{id}/share/revoke` | 撤销只读分享，旧链接立即失效（仅本人，需 CSRF） |
| DELETE | `/api/comparisons/{id}` | 删除本人的对比记录（需 CSRF） |
| GET | `/api/comparisons/share/{token}` | 只读分享内容，无需登录 |
| GET | `/api/favorites` | 我的收藏分页列表（含仓库卡与备注） |
| POST | `/api/favorites` | 收藏仓库，支持备注（需 CSRF） |
| GET | `/api/favorites/status?fullName=` | 查询单个仓库是否已收藏 |
| GET | `/api/favorites/statuses?fullNames=` | 批量查询收藏状态（逗号分隔，最多 50 个） |
| PATCH | `/api/favorites/{id}` | 修改收藏备注（仅本人，需 CSRF） |
| DELETE | `/api/favorites/{id}` | 取消收藏（仅本人，需 CSRF） |
| GET | `/api/profile` | 我的技能 / 兴趣 / 偏好画像 |
| PUT | `/api/profile` | 更新画像（仅本人，需 CSRF） |
| GET | `/api/profile/recommendations?limit=` | 基于画像的推荐位（排除已收藏） |
| GET | `/api/conversations` | 我的会话历史分页列表 |
| GET | `/api/conversations/{id}` | 会话详情与消息（仅本人） |
| DELETE | `/api/conversations/{id}` | 删除会话与消息（仅本人，需 CSRF） |
| DELETE | `/api/account` | 删除账号并清理收藏 / 想法 / 对比 / 会话 / 画像 / 用量（需 CSRF） |
| GET | `/api/ops/metrics?days=7` | 成本看板：日请求数、token、P95 延迟与预算告警（仅 `OPS_GITHUB_LOGINS`，未配置时 403） |
| GET | `/api/health` | 健康检查：MySQL / Redis 任一不可用返回 503（供容器健康检查） |
| GET | `/ai/health` | AI 网关健康检查（含 Qdrant 连通性，始终 200） |
| POST | `/ai/chat/stream` | AI 对话 SSE（需登录，`X-User-Id` 由 Nginx 透传）：`meta` / `status` / `tool` / `repos` / `delta` / `done` / `error` |
| POST | `/ai/match` | 语义匹配 SSE（需登录）：请求 `{ideaId?, rawText?, structured?, limit?}`，事件 `parsed` / `status` / `candidate` / `done` / `error` |
| POST | `/ai/compare` | 深度对比 SSE（需登录）：请求 `{ideaId?, rawText?, structured?, repoKeys[2–4], force?}`，事件 `plan` / `cell` / `verdict` / `done` / `error` |

`/ai/match` 的 `candidate` 包含：仓库卡、`fit`（0–1）、`breakdown`（semantic / coverage / maintenance / license）、`reasons` / `risks`、`conditions`（hit / miss / unknown）与可追溯的 README `evidence`。信息不足时返回 `unknown`，不会臆造。

`/ai/compare` 的 `cell` 包含：`dimensionKey` / `repoKey` / `value` / `confidence` 与 `evidence[]`（section、snippet、sourceUrl、chunkType）。没有证据的单元格固定为「信息不足」；`done` 返回落库的 `comparisonId`（未落库为 null），`cached=true` 表示命中缓存且未扣配额。

服务间接口（`X-Internal-Token`，Nginx 对外 404）：`POST /api/internal/quota/reserve`、`GET /api/internal/repos/search`、`GET /api/internal/repos/rank`、`GET /api/internal/repos/{fullName}`、`POST /api/internal/repos/batch`、`GET /api/internal/index/repos`、`POST /api/internal/repo-documents`、`POST /api/internal/index/mark`、`POST /api/internal/conversations`、`POST /api/internal/messages`、`GET|POST|PATCH /api/internal/ideas*`、`POST /api/internal/comparisons`、`POST /api/internal/ai-metrics`、`GET /api/internal/auth/session`。

个人中心页面：`/me`（配额、画像、推荐位与资产总览）、`/me/favorites`、`/me/ideas`、`/me/comparisons`、`/me/comparisons/{id}`、`/me/conversations`、`/me/conversations/{id}`。

运维页面：`/ops`（成本看板：日请求 / token / P95 延迟 / 预算告警，仅 `OPS_GITHUB_LOGINS` 中的账号可见）。llm-service 在每个 chat / match / compare 请求结束时上报 `POST /api/internal/ai-metrics`，写入 `ai_metrics`；指标上报失败只记日志，不影响 SSE 主链路。

## 数据与索引

- **MySQL**：`repositories`（仓库主表，含 `category`、`platform` / `platforms`、`latest_release_tag` / `latest_release_at`、`readme_sha`、`docs_indexed_at`）+ `tags` / `repo_tags` + `sync_logs` + `repo_documents`（README 与 manifest 原文、sha、ETag、token 数，唯一键 `repo_id + kind`）+ `ideas`（用户想法与结构化条件，按 `user_id` 隔离）+ `comparisons`（对比结果 JSON、cacheKey、只读 share token，按 `user_id` 隔离）+ `favorites`（收藏与备注，唯一键 `user_id + repo_id`）+ `users` / `conversations` / `messages` / `usage_daily` / `user_profiles` + `ai_metrics`（请求级 token、延迟、结果，供成本看板与告警）。
- **Release 与多平台**：每天用 GitHub GraphQL 批量刷新 `latestRelease`（每批 50 个仓库，单次最多 1000 个）；`release_checked_at` 记录检查时间，无 Release 的仓库也记录，避免重复请求。`platforms` 由 topics / 描述 / 语言规则推导，供列表卡展示与匹配条件过滤使用。
- **Qdrant**：`repo_chunks` 集合，dense 向量（默认 1024 维，cosine），按 Markdown 标题切成 400–800 tokens、重叠 80，payload 带 `repo_id` / `full_name` / `language` / `category` / `license` / `platform` / `stars` / `pushed_at` / `chunk_type`（`readme` / `manifest`）供过滤与追溯。point id 由 `full_name + chunk_hash` 生成 UUID，重复写入幂等。低内存部署可开启 int8 标量量化：量化向量与 HNSW 图 `pinned` 常驻内存（约 54M + 7M），原始 float32 向量仍落盘，仅用于查询时对 Top-K 候选 rescore（`oversampling=2`），避免 2C2G 上 mmap 反复缺页读盘。
- **缓存**：匹配结果 10 分钟、对比结果 7 天、对比 checkpoint 1 小时、榜单与元数据 5 分钟；索引 worker 用 Redis 锁 + 游标实现断点续跑。
- **评测**：`llm-service/tests/eval/dataset.jsonl`（24 条需求）与 `compare_dataset.jsonl`（3 组真实需求盲测、覆盖 10 个热门项目）；`python -m tests.eval.run_eval` / `run_compare_eval` 分别生成匹配与对比报告。

## 安全与合规

- 模型 Key 只存在 `llm-service` 环境变量，前端与后端均不可见。
- 会话 Cookie `httpOnly + Secure + SameSite=Lax`，写接口启用 CSRF token；HTTPS 站点若关闭 Secure，backend 启动期直接失败。
- `/api/internal/**` 外网 404；服务间调用需 `X-Internal-Token`。
- Nginx 按来源 IP 限流：`/ai/` 3r/s、`/api/` 20r/s、README 摘要 1r/s、登录入口 1r/s；README 单独收紧以保护 GitHub Token 配额。
- Redis 开启 AOF（everysec），对比 checkpoint 重启不丢；配额权威计数与账本落 MySQL，`ai_metrics` 按保留期自动清理。
- README 与用户输入一律视为不可信：清洗 HTML、工具结果包裹、Markdown 禁止 raw HTML。
- 只缓存公开 README 并标注来源，不复制全文分发，遵循 GitHub API 条款。

## 文档

- [完整方案（v1.1，Python + LangGraph）](doc/技术方案/AI匹配与对比平台完整方案.md)
- [四个差异化功能方案（F1–F4）](doc/四个差异化功能方案.md)：多周期趋势榜、AI 中文解读、健康度评分、Release 与安装包聚合
- [技术方案（基线）](doc/技术方案/技术方案.md)：技术栈、表结构、采集引擎与阶段计划
- [语义匹配基线报告](doc/eval/baseline.md)：数据集、指标定义与运行结果
- [深度对比评测](doc/eval/compare.md)：10 个热门项目盲测数据集、证据覆盖率与信息不足率

## 贡献

欢迎提 Issue 讨论需求与选型场景。提交 Pull Request 前请确保：`mvn -q package`、`npm run build`、`uv run ruff check`、`uv run pytest` 通过，新增接口附带最小可复现示例。
