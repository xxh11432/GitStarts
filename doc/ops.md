# 运维手册

覆盖日常巡检、成本看板、依赖复检、压测、数据维护与安全基线。部署步骤见 [deploy.md](./deploy.md)。

## 1. 服务与日志

| 服务 | 职责 | 关键日志 |
| --- | --- | --- |
| `nginx` | TLS / 按 IP 限流（`/api/`、`/ai/`、README、登录）、内部接口隔离 | `access.log`、`error.log` |
| `frontend` | Next.js 页面与 RSC | 容器 stdout |
| `backend` | 业务 API、配额、内部接口 | `requestId`、`quota_*`、`ops_budget_alert` |
| `llm-service` | SSE、Graph、模型调用 | `chat_*` / `match_*` / `compare_*`、`metric_report_failed` |
| `ingest-worker` | GitHub 同步、README / manifest 索引 | `index_run_*`、`fetch_*` |
| `alert-worker` | 容器状态与 ERROR 日志巡检 → 飞书卡片 | 巡检结果、`推送失败`、心跳 |
| `mysql` / `redis` / `qdrant` | 持久化、配额与缓存、向量检索 | 各自容器日志 |

```bash
docker compose ps
docker compose logs -f --tail=200 llm-service
docker compose logs backend | grep ops_budget_alert
```

## 2. 成本看板与告警

入口：`https://<域名>/ops`，仅 `OPS_GITHUB_LOGINS` 中的账号可见；未配置时所有人 403。

数据链路：

1. llm-service 在每个 `chat` / `match` / `compare` 请求结束时调用 `POST /api/internal/ai-metrics`；
2. backend 写入 `ai_metrics`（kind、status、tokens_in/out、latency_ms、cached、created_at）；
3. `/api/ops/metrics?days=N` 按天聚合请求数、token、错误数与 P95（最近秩法）；
4. 越界时：

   - `/ops` 顶部展示红色告警；
   - backend 每小时打印一次 `ops_budget_alert code=... day=... value=... threshold=...`（logger 名 `ops_alert`）。

预算配置（`.env`）：

| 变量 | 默认 | 含义 |
| --- | --- | --- |
| `OPS_DAILY_TOKEN_BUDGET` | 2000000 | 日 token（输入+输出）上限 |
| `OPS_DAILY_COMPARE_BUDGET` | 200 | 日对比请求上限 |
| `OPS_P95_CHAT_MS` | 30000 | 对话 P95 上限 |
| `OPS_P95_MATCH_MS` | 30000 | 匹配 P95 上限 |
| `OPS_P95_COMPARE_MS` | 180000 | 对比 P95 上限 |

> 指标上报失败只会产生 `metric_report_failed` 日志，不影响用户请求；出现该日志时检查 `INTERNAL_TOKEN` 与 backend 健康状态。
> `ai_metrics` 只存聚合所需的匿名指标，不存用户 ID、需求原文或模型输出。

### 2.1 数据保留

backend 每天自动分批清理超过 `OPS_METRICS_RETENTION_DAYS`（默认 180 天）的 `ai_metrics`；
设为 `0` 可关闭自动清理，改用下面的手工 SQL：

```sql
-- 注意：开启自动清理时无需再手工执行
DELETE FROM ai_metrics WHERE created_at < NOW() - INTERVAL 180 DAY LIMIT 10000;
```

### 2.2 异常日志通知（alert-worker）

`alert-worker` 每 60 秒通过 Docker Engine API 巡检一次，覆盖：

- 容器退出、OOM、重启次数增加；
- healthcheck 变为 `unhealthy`（持续失败每 2 小时提醒一次）；
- 错误日志：backend `ERROR/FATAL`、llm-service / ingest-worker JSON `error|critical`、nginx 5xx、`ops_budget_alert`。

同签名 30 分钟内不重复推送，每小时最多 10 条；连续 1 小时无异常时推送一条心跳。
`alert-worker` 自身不参与巡检，巡检水位保存在 `alert-state` 卷。

| 变量 | 默认 | 含义 |
| --- | --- | --- |
| `ALERT_WEBHOOK` | 空 | 飞书群机器人 webhook；留空时只巡检不推送 |
| `ALERT_SECRET` | 空 | 群机器人开启签名校验时的密钥 |
| `ALERT_ENABLED` | true | 通知开关 |
| `ALERT_ENV` | production | 卡片标题中的环境标识 |
| `ALERT_INTERVAL_SECONDS` | 60 | 巡检间隔 |

```bash
docker compose logs -f alert-worker
docker compose exec alert-worker python /app/alertd.py --dry-run   # 只打印命中的告警
docker compose exec alert-worker python /app/alertd.py --test      # 发送一条真实测试卡片
```

> webhook / secret 只放在 `.env`（已 gitignore），不要提交到仓库或写进镜像。

## 3. 依赖漏洞复检（M7）

一条命令复检三端（需要访问 api.osv.dev、npm、PyPI）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\security\osv-audit.ps1
```

分项命令：

```bash
# backend：Maven 依赖清单后按 OSV 查询（脚本已封装）
cd backend && mvn dependency:list -DincludeScope=runtime -DoutputFile=deps.txt

# frontend
cd frontend && npm audit --omit=dev

# llm-service
cd llm-service && uv export --no-hashes --format requirements-txt > req.txt
uvx pip-audit -r req.txt
```

### 3.1 2026-10-25 复检结果

| 端 | 处置 | 剩余 |
| --- | --- | --- |
| backend | Spring Boot 3.5.4 → 3.5.16；覆盖 Jackson 2.21.8 / Log4j 2.25.5 / Netty 4.1.139 / Tomcat 10.1.59 | Spring Framework 6.2.19 的 2 条 critical，暂无修复版本 |
| frontend | Next 14.2.35 → 16.4.3（React 18 → 19.3.1）；PostCSS 8.5.31 | Tailwind 3.4.6 / postcss-nested 构建期 moderate（3 条，运行期不可达） |
| llm-service | — | Pillow 12.3.0 被 `fastembed<13` 锁定，37 条 |

### 3.2 已登记例外（需在升级窗口复核）

1. **Spring Framework 6.2.19：SSE 分片渲染流损坏 / XsltView 路径限制。**
   本项目 SSE 由 Python 服务提供，`XsltView` 未使用；两条均不可达。等待 Spring Framework 6.2.20 或随 Spring Boot 4 升级。
2. **Pillow（fastembed 传递依赖）：图片解析类漏洞。**
   本服务只做文本 embedding，不接收或解析用户图片；`fastembed` 0.9.0 要求 `Pillow<13`。等待 fastembed 放宽约束后升级。
3. **Tailwind 3.4.6 / postcss-nested 6.2.0 / postcss-selector-parser 6.1.5：构建期供应链问题（moderate，`npm audit` 3 条）。**
   仅在构建镜像时处理仓库内 CSS，不接受用户 CSS 输入；运行时 `.next/standalone/node_modules` 只有 12 个包，不含 Tailwind / PostCSS，运行期不可达。修复需升级 Tailwind 4（视觉与配置迁移），留待单独评估。
4. ~~Next.js 14.2.35：critical/high~~ —— **已于 2026-10-25 升级到 16.4.3，`npm audit` critical/high 归零**；同时完成 React 19 迁移（`cookies()`、`params`、`searchParams` 改为异步）。

## 4. 压测

脚本：`deploy/loadtest/sse_load.py`（仅标准库）。

```bash
# 对话 SSE：先取登录 Cookie（浏览器 DevTools → Application → Cookies）；/ai/** 不需要 CSRF
python deploy/loadtest/sse_load.py sse \
  --url http://localhost/ai/chat/stream \
  --cookie "GS_SESSION=<值>" \
  --body '{"conversationId":null,"messages":[{"role":"user","content":"推荐一个轻量级任务队列"}]}' \
  --concurrency 10 --requests 20

# 对比 SSE：{{uuid}} 保证每次都是新 cacheKey，可同时观察配额扣减
python deploy/loadtest/sse_load.py sse \
  --url http://localhost/ai/compare \
  --cookie "GS_SESSION=<值>" \
  --body @compare.json --concurrency 2 --requests 10

# Qdrant 检索：直接打 points/search，绕过 embedding 与模型成本
python deploy/loadtest/sse_load.py qdrant \
  --url http://localhost:6333 --collection repo_chunks --dim 1024 \
  --concurrency 20 --requests 200
```

> Nginx 默认对单 IP 限流（`/ai/` 3r/s、`/api/` 20r/s、README 1r/s）。
> 高并发压测请在预发布环境临时调高对应 `limit_req`，否则 429 会被计入错误率。

判定标准（M7）：

- 核心流程错误率 < 1%（脚本输出 `errorRate`）。
- 对话首包 P95 ≤ 5s；对话/匹配 P95 ≤ 30s；对比 P95 ≤ 180s（与 `/ops` 告警阈值一致）。
- 配额扣减与成功请求数一致：压测后对比 `/api/me` 的剩余额度与脚本成功数。
- 压测会真实消耗模型额度，使用测试账号并避开业务高峰。

结果登记模板：

```text
日期 / 版本：
环境（CPU、内存、并发）：
chat:  req/s=   err=   p50=   p95=   TTFT p95=
match: req/s=   err=   p50=   p95=
compare: req/s= err=   p50=   p95=
qdrant: req/s=  err=   p50=   p95=
结论（是否达标 / 瓶颈）：
```

> 当前仓库内没有常驻压测环境，上表需在预发布环境执行后填写；禁止把未执行的数字当作验收结果。

## 5. 数据维护

```bash
# 备份（每天一次；保留 7 天）
docker compose exec -T mysql mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction "$MYSQL_DATABASE" | gzip > backup-$(date +%F).sql.gz

# Redis：配额与 checkpoint，Compose 已开启 AOF（appendonly yes + everysec）；Qdrant 快照
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
docker compose exec qdrant curl -s -X POST http://localhost:6333/snapshots
```

升级后重跑 `deploy/init.sql` 即可补齐新表（全部 `IF NOT EXISTS`）。

## 6. 日常巡检（每日 / 每周）

- 每日：`/ops` 错误数、日 token、日对比、P95；`metric_report_failed`；容器健康。
- 每周：`osv-audit.ps1`；慢查询（`ai_metrics`、`messages`、`repositories`）；磁盘（`/_next` 已禁用优化器，重点看 MySQL/Qdrant 与日志）。
- 每月：配额是否被异常消耗；`usage_daily` 与 `ai_metrics` 的对比/对话次数是否一致；备份可恢复性抽检。
