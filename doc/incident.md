# 故障预案

原则：先止损（限流 / 回滚 / 降级），再定位；任何“重置数据”操作前先备份。
所有故障记录时间线、影响面、根因、处置与后续动作。

## 0. 快速定位

```bash
docker compose ps
docker compose logs --tail=200 backend
docker compose logs --tail=200 llm-service
docker compose logs --tail=100 nginx
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/ai/health
```

| 现象 | 优先排查 |
| --- | --- |
| 全站 502/504 | Nginx → frontend/backend 健康、容器重启 |
| 登录后立刻掉登录 | HTTPS / `SESSION_COOKIE_SECURE` / OAuth 回调 |
| 对话、匹配、对比报 `backend_unavailable` | backend `/internal/**`、`INTERNAL_TOKEN` |
| 匹配结果为空 | Qdrant、README 索引、硬过滤 |
| 对比长时间无输出 | 供应商限流、Redis checkpoint、compare 超时 |
| `/ops` 500 | `ai_metrics` 表是否已创建（重跑 init.sql） |

## 1. 模型供应商故障（429 / 5xx / 超时）

**信号**：`chat_timeout`、`match_timeout`、`compare_timeout`、`provider_error`、错误事件 `timeout`；`/ops` 错误数上升。

**处置**：

1. 确认供应商状态页与 API Key 额度；检查是否只有某一模型不可用。
2. 临时降低并发：`.env` 中 `COMPARE_CONCURRENCY` 调小，重启 llm-service。
3. 429 时优先等待配额恢复或申请临时额度；不要通过提高重试次数放大压力。
4. 超时集中在对比：确认 `COMPARE_TIMEOUT_SECONDS` 与 `OPS_P95_COMPARE_MS` 是否匹配。
5. 若供应商持续不可用：在前端公告“AI 功能暂不可用”，保留搜索、榜单、详情等非 AI 功能。
6. 恢复后抽查一次 chat / match / compare，确认 `/ops` 错误率回落。

## 2. Qdrant 不可用

**信号**：`vector_search_failed`、`match_fallback_popular`、匹配质量骤降；对比证据为空或大面积“信息不足”。

**处置**：

1. `docker compose ps qdrant`、`docker compose logs qdrant`；检查磁盘与内存。
2. 重启 `qdrant`，等待健康后重启 `llm-service`。
3. 集合损坏：从最近快照恢复（`/snapshots`），再重跑索引；恢复前先备份当前卷。
4. 索引缺失：确认 `ingest-worker` 的 `index_run_finished` 与 `indexed` 计数；必要时降低 `INDEX_MAX_REPOS` 分批重建。
5. 恢复后跑 `tests.eval.run_eval --limit 10`，对比基线。

## 3. Redis 不可用

**信号**：配额相关 500/503、`QuotaUnavailable`、对比无法续跑、缓存全部 miss。

**处置**：

1. Redis 是配额与 checkpoint 的强依赖：配额失败为 **fail-closed**，不会放行超限请求。
2. 重启 `redis`，确认 AOF 恢复；检查 `maxmemory` 与淘汰策略（配额键不可被淘汰）。
3. 配额键丢失会重置当天用量：这是可用性优先的既成事实，需在事后核对 `usage_daily` 并对异常账号补偿或限制。
4. checkpoint 丢失：客户端需重新发起对比；不要复用旧 `cacheKey` 期待续跑。
5. 缓存 Redis 故障时可临时关闭缓存读（如果配置支持），但不要关闭配额。

## 4. MySQL 不可用

**信号**：backend 健康检查失败、所有业务 500、llm-service `internal_request_failed`。

**处置**：

1. `docker compose ps mysql`、磁盘空间、连接数；确认不是密码/网络配置变更。
2. 短时故障：重启并等待恢复；期间前端展示维护提示。
3. 数据损坏：停止写入 → 从最近 `mysqldump` 恢复 → 重放增量（如有）→ 重跑 `init.sql`。
4. 恢复后核对：用户、收藏、想法、对比、会话、`usage_daily`、`ai_metrics` 行数是否合理。

## 5. SSE 断流 / 对比无法续跑

**信号**：客户端提示连接中断；`compare_cancelled`；重复请求同一 `cacheKey` 仍从头开始。

**处置**：

1. 检查 Nginx：`/ai/**` 必须 `proxy_buffering off`、`gzip off`、`X-Accel-Buffering no`、`proxy_read_timeout` 足够长。
2. 检查是否有中间代理/CDN 缓冲 SSE；确认 HTTP/1.1、无响应压缩。
3. checkpoint 有效期 1 小时；超时后续跑会重新开始，属于预期。
4. 不要为“减少断流”而无限提高超时；优先修复网络与代理配置。
5. 断流请求记入 `cancelled` 指标，不重复计费；若发现配额被重复扣减，按 `usage_daily` 与 `ai_metrics` 核对后人工补偿。

## 6. 登录 / OAuth 故障

**信号**：GitHub 回调后 401、登录循环、Cookie 不下发。

**处置**：

1. 回调地址必须与 GitHub OAuth App 完全一致：`https://<域名>/api/auth/github/callback`。
2. 生产必须 HTTPS；HTTP 下 `SESSION_COOKIE_SECURE=true` 会导致 Cookie 不发送。
3. 检查 `AUTH_GITHUB_CLIENT_ID/SECRET` 是否与当前环境一致；回调域名变更后同步更新。
4. 浏览器 SameSite=Lax 会拦截跨站 POST 回调；保持 GitHub 回调为顶层 GET 跳转。
5. 清除浏览器 `GS_SESSION` 与 `XSRF-TOKEN` 后重试。

## 7. 成本 / 预算告警

**信号**：`/ops` 红色告警；`ops_budget_alert` 日志。

**处置**：

1. 先看 `ai_metrics` 的类型分布：是对话、匹配还是对比异常增长。
2. 对比增长通常来自重复提交或缓存未命中（`cached=0` 占比）；检查 `cacheKey` 是否每次随机。
3. token 增长但请求数正常：检查是否模型切换、上下文变长或输出上限变化。
4. P95 增长：按第 1 节排查供应商，再检查 Nginx 与 Redis / Qdrant。
5. 确认预算确实需要调整时再改 `.env`；否则优先限流、收紧配额、修复缓存。

## 8. 依赖高危漏洞

**信号**：`osv-audit.ps1` 返回 critical/high；CI/巡检报告。

**处置**：

1. 先判断可达性：运行期 / 构建期、是否处理不可信输入、是否在 Linux 容器。
2. 有修复版本：小版本直接升级并跑完整测试；大版本（如 Next 16、Spring Boot 4）单独立项评审。
3. 无修复版本：登记例外（[ops.md](./ops.md) 3.2），写明不可达理由与复核时间。
4. 24 小时内必须处置运行期 critical；不可达的 critical 需在 7 天内复核或升级。

## 9. 索引 Worker 卡住 / 额度耗尽

**信号**：`fetch_rate_limited`、GitHub 403/429、`index_run_finished indexed=0`、日志长时间无进展。

**处置**：

1. 检查 `GITHUB_TOKEN` 有效期与剩余额度；未配置 Token 时限额极低。
2. 确认 `GITHUB_ALLOWED_HOSTS` 与实际 API 主机一致（白名单拦截会抛 `GithubTargetError`）。
3. 降低批量：`INDEX_MAX_REPOS` 设为小值，重启 worker 分批推进。
4. 不要删除 Qdrant 集合“重来”；增量重跑会按 repo_id + chunk_type 覆盖。
5. 连续失败时暂停 worker，避免无效请求耗尽额度。

## 10. 回滚

```bash
docker compose down
git checkout <上一稳定 tag>
docker compose up -d --build
```

- 数据库变更仅新增表/字段，旧版本可继续运行；不要为回滚删除 `ai_metrics`。
- 回滚后验证：登录、首页、一次 chat、一次 match、一次 compare、`/ops`。
- 回滚不能替代根因分析；24 小时内补齐事故记录。
