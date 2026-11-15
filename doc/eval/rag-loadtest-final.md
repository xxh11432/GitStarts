# RAG 匹配链路压测报告（冻结版）

- 日期：2026-11-15
- 代码版本：`8c1c436`（冻结版 RAG，`MATCH_CACHE_VERSION=v7`）
- 部署：2C2G 云服务器，Docker Compose；`gs-llm-service` 内存上限 224 MiB
- 被测接口：`POST /ai/match`（SSE），容器内直连 `http://127.0.0.1:8081`，绕过 Nginx `/ai/` 限流
- 数据集：[dataset40-optimized.jsonl](../../llm-service/tests/eval/dataset40-optimized.jsonl)，40 条需求，`limit=6`
- 压测脚本：[load_match.py](../../llm-service/tests/eval/load_match.py)
- 向量库：`repo_chunks_bge_m3`，68329 points（其中 `repo_summary` 2773 块）

## 1. 结论

| 指标（2 并发） | 结果 |
|---|---:|
| 有效请求 | 80 / 80（0 失败、0 降级、0 缓存命中） |
| 首字（首个 SSE 事件）P50 / P95 / P99 | 21 ms / **38 ms** / **42 ms** |
| 解析完成（parsed）平均 / P95 | 5.87 s / 6.48 s |
| 召回完成（首个候选）平均 / P95 / P99 | **10.52 s** / 15.05 s / 16.98 s |
| 纯召回段（retrieving → 首个候选）平均 / P95 | 4.66 s / 8.58 s |
| 总耗时平均 / P95 / P99 | 10.55 s / 15.08 s / 17.01 s |
| Top-1 准确率（严格 match） | **22 / 40（55.0%）** |
| Top-1 准确率（match + partial） | **40 / 40（100.0%）** |

关键判断：

1. **首字不是瓶颈**：SSE 首个事件 P95 38 ms、P99 42 ms；即使并发 3 也只有 P95 129 ms。
2. **召回平均 10.5 秒**，与冻结评测的 9.6–12 秒一致；时间主要花在两段：结构化解析 + 子问题拆分约 5.9 s，向量召回 + 加权 rerank 约 4.7 s。
3. **Top-1 严格准确率 55%**，但 40/40 的 Top-1 都是 match/partial；与 Hit@6 97.5% 的差距来自「只允许第一名，没有再选机会」。
4. **稳定并发只有 2**：并发 3 时 15/40 请求解析失败并静默降级（HTTP 仍是 200、结果看似正常），并发 4 时约 56/80 降级、3 次失败。瓶颈在上游模型 RPM，不在 2C2G 机器本身（压测后 llm-service 84 MiB / 224 MiB，CPU 采样 0.14%）。

## 2. 方法

- **隔离**：每条请求使用独立虚拟用户 id（`900000+`），匹配缓存必然不命中，也不会撞上 30 次/天的用户配额；压测结束后清理了 `ideas` 246 行、`quota_ledger` 244 行、`usage_daily` 204 行测试数据（已确认真实用户最大 id 为 2）。
- **直连**：请求直接打到 `llm-service:8081`，带 `X-User-Id`，不经过 Nginx，因此结果不含 Nginx 限流与公网 RTT；也不含前端渲染。
- **延迟口径**（客户端观测，`time.perf_counter`）：
  - 首字 = 收到第一个 SSE 事件（`status: filtering`），包含 Redis 缓存探测与配额预留；
  - 解析完成 = `parsed` 事件；
  - 召回完成 = 第一个 `candidate` 事件，含解析、子问题拆分、向量召回、RRF 与 rerank；
  - 纯召回段 = 召回完成 − `status: retrieving`；
  - 总耗时 = SSE 流结束（`done`）。
- **有效样本**：只统计 HTTP 成功、结构化解析未降级、未命中缓存的请求；降级与失败单独计数。
- **分位数**：线性插值。有效样本 80 条，P99 已接近最大值，长尾判断以 P95 为主。
- **Top-1 判定**：沿用冻结评测的 LLM-as-Judge（prompt v1、只喂用户原文与 Top-1 候选事实、不传 fit/排名），每个 Top-1 判为 match/partial/mismatch。

## 3. 延迟结果

| 档位 | 并发 | 请求 | 成功 | 有效 | 降级 | 失败 | 首字 P50 | 首字 P95 | 首字 P99 | 召回完成 avg | 召回完成 P95 | 纯召回 avg | 总耗时 P50 | 总耗时 P95 | 总耗时 P99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| quality | 2 | 80 | 80 | 80 | 0 | 0 | 21 | 38 | 42 | 10524 | 15045 | 4657 | 9916 | 15082 | 17008 |
| probe3 | 3 | 40 | 40 | 25 | 15 | 0 | 23 | 129 | 132 | 10210 | 13272 | 4579 | 9688 | 13298 | 13645 |

单位：毫秒。`probe3` 的延迟只统计 25 条未降级样本，均值受样本构成影响，仅作边界参考。

2 并发档的分段耗时：

| 阶段 | 平均 | P50 | P95 | P99 |
| --- | ---: | ---: | ---: | ---: |
| 首字 | 23 | 21 | 38 | 42 |
| 解析完成 | 5867 | 5686 | 6476 | 9937 |
| 召回完成 | 10524 | 9887 | 15045 | 16982 |
| 纯召回段 | 4657 | 4079 | 8577 | 11238 |
| 总耗时 | 10552 | 9917 | 15082 | 17008 |
| 服务端自报耗时（done.tookMs） | 10503 | 9862 | 15028 | 16962 |

## 4. Top-1 准确率

严格口径 22/40（55.0%），宽松口径 40/40（100.0%）。判定明细：

| 用例 | Top-1 | 判定 | 判定理由 |
| --- | --- | --- | --- |
| kb-rag | HKUDS/LightRAG | partial | RAG 框架支持文档检索，但证据未显示现成 Web 界面 |
| ai-chat-ui | ChatGPTNextWeb/NextChat | match | Web 聊天界面，支持多模型与对话记录，MIT 可自托管 |
| llm-gateway | QuantumNous/new-api | match | 自托管网关，含密钥分发、额度与用量统计 |
| agent-framework | ag2ai/ag2 | match | Python 多 Agent 编排，含工具调用与协作 |
| mcp-tools | github/github-mcp-server | match | 官方现成 MCP 服务器，可直接为 Agent 扩展工具 |
| ai-coding | aspasskiy/GoGogot | match | 可自托管终端代理，能执行命令与编辑文件 |
| local-inference | ztxz16/fastllm | partial | 本地 GPU 推理引擎，但未明确 OpenAI 兼容 API |
| image-gen | AUTOMATIC1111/stable-diffusion-webui | match | 文生图 Web UI，支持模型管理与扩展 |
| tts | RVC-Boss/GPT-SoVITS | match | 支持音色克隆与中文 TTS |
| document-ocr | ocrmypdf/OCRmyPDF | match | 批量 OCR 生成可搜索 PDF，核心场景满足 |
| ai-workflow | dograh-hq/dograh | partial | 有可视化工作流，但定位语音 AI 平台 |
| vector-db | qdrant/qdrant | match | 向量库支持过滤、水平扩展与 Python 客户端 |
| ai-video | harry0703/MoneyPrinterTurbo | match | 自动生成脚本、素材、字幕并合成短视频 |
| monitoring | henrygd/beszel | match | 轻量监控，支持自定义告警，部署简单 |
| container-ui | dockpeek/dockpeek | partial | 支持多主机与日志，但未提及重启容器 |
| home-automation | home-assistant/core | match | 家庭自动化平台，设备接入与场景自动化 |
| photo-mgmt | immich-app/immich | match | 自托管相册，App 自动备份；人脸/分享未明示 |
| media-server | kaybi-gh/K7 | partial | 影音服务器，但未提及手机 App 播放 |
| file-sync | Sync-in/server | partial | 同步与分享满足，手机客户端证据不足 |
| notes-selfhost | usememos/memos | partial | Markdown 自托管笔记，双向链接未提及 |
| bookmark-manager | linkwarden/linkwarden | partial | 自托管书签，标签/全文搜索/插件证据不足 |
| rss-reader | babarot/oksskolten | partial | 全文抓取满足，多设备同步证据不足 |
| team-wiki | Smaug6739/Alexandrie | match | 自托管知识库，Markdown、权限隔离与搜索 |
| project-mgmt | plankanban/planka | partial | 看板与任务满足，里程碑未提及，许可证待确认 |
| lowcode-platform | OpnForm/OpnForm | partial | 表单搭建满足，审批流与自托管证据不足 |
| automation | kossakovsky/selfhost-ai | partial | 一键自托管 AI 工具栈，本身不是编排平台 |
| bi-dashboard | frappe/insights | match | 多数据源与拖拽报表，满足 BI 看板需求 |
| blog-cms | rikhuijzer/bloglite | partial | 支持 Markdown 与自托管，主题/SEO 证据不足 |
| team-chat | chattocorp/chatto | partial | 可自托管聊天，频道/文件/移动端证据不足 |
| mail-server | mailez-hq/mailez | match | 自有域名、SMTP/IMAP、反垃圾，Compose 部署 |
| cicd | kubero-dev/kubero | partial | 自托管 PaaS，私有 Git 与流水线证据不足 |
| api-gateway | Kong/kong | match | 路由、负载均衡与鉴权，契合微服务网关 |
| authz | casdoor/casdoor | match | 自托管 IAM，OIDC 与 RBAC |
| api-testing | usebruno/bruno | match | API 调试 IDE，集合、环境变量与 CLI 测试 |
| diagram | excalidraw/excalidraw | match | 开源白板，支持协作与流程图 |
| workflow-scheduler | apache/airflow | match | DAG 编排、调度与监控 |
| crm-erp | shyamsitaula/samarium | partial | 覆盖客户/销售/财务，但项目仍在开发中 |
| analytics | umami-software/umami | match | 隐私优先、自托管访问统计 |
| db-client | TableProApp/TablePro | partial | macOS 客户端支持 MySQL/PostgreSQL，SSH 隧道未提及 |
| crawler | D4Vinci/Scrapling | partial | 支持代理与并发爬取，分布式调度证据不足 |

Top-1 未判 match 的 18 条，原因集中在两类：一是该用例的关键能力（双向链接、SSH 隧道、里程碑、移动端）在候选仓库的证据里没有出现；二是 Top-1 属于相邻形态（如语音工作流平台、AI 工具栈）。放宽到 partial 后 40 条全部可接受。

## 5. 限流边界与稳定性

同一时段做了两档探测：

| 并发 | 请求 | 降级（解析失败走兜底） | 硬失败 | 结论 |
| ---: | ---: | ---: | ---: | --- |
| 2 | 80 | 0 | 0 | 稳定，可作为延迟与准确率口径 |
| 3 | 40 | 15（37.5%） | 0 | 已触发上游限流，部分请求静默降级 |
| 4（首轮探测，数据作废） | 80 | 约 56 | 3 | 大面积 429，延迟与 Top-1 均不可信 |

说明：

- 降级由 `OpenAIRateLimitError` 触发：结构化解析失败后走兜底 query，请求仍在 1–2 秒内返回 HTTP 200，但结果明显变差（Top-1 出现 `public-apis`、`devops-exercises` 等泛化仓库）。因此**只看 HTTP 成功率会高估容量**。
- 并发 3 时首字 P95 从 38 ms 升到 129 ms，说明事件循环已开始排队；延迟长尾仍受上游模型排队影响。
- 压测后 `gs-llm-service` 内存 84 MiB / 224 MiB、CPU 采样 0.14%，`gs-qdrant` 10 MiB / 384 MiB，容器无重启、无 OOM；`gs-backend` 345 MiB / 400 MiB（压测期间配额与仓库补全调用抬高了常驻内存，建议继续观察）。

## 6. 结论与建议

1. **SSE 首字达标**：P95 38 ms、P99 42 ms，流式体验的等待感不来自首包。
2. **召回 10.5 秒是主要成本**：解析 + 子问题拆分 5.9 s，召回 + rerank 4.7 s；如需压缩 P95，优先考虑降低子问题拆分的一次模型往返，或把 rerank 批量化，而不是换更快的机器。
3. **Top-1 严格 55% / 宽松 100%**：与 Hit@6 差 42.5 个百分点，属于「只取第一名」的结构性差异；产品上如果要提高首条可采纳率，应保留多条候选而不是只展示一条。
4. **容量上限在上游 RPM，不在 2C2G**：稳定并发 2；并发 ≥3 会静默降级。建议在网关或前端把 `/ai/match` 的并发限制在 2，并给降级响应打标（例如 `degraded=true`），避免用户把兜底结果当成正常匹配；需要更高并发时应先提高模型供应商配额或做多 key 轮换。
5. **不要把并发 4 的延迟当作容量数据**：本轮已作废，仅用于确认限流边界。

## 7. 复现

```bash
# 1) 脚本拷入 llm-service 容器
scp llm-service/tests/eval/load_match.py gitstars-tx:~/load_match.py
ssh gitstars-tx 'sudo docker cp ~/load_match.py gs-llm-service:/tmp/load_match.py'

# 2) 容器内直连压测（2 并发 80 次 + 3 并发探测 40 次，并对 Top-1 做 LLM 判定）
ssh gitstars-tx 'sudo docker exec gs-llm-service env PYTHONPATH=/app python /tmp/load_match.py \
  --stages warmup:1:2,quality:2:80,probe3:3:40 \
  --judge-cache /tmp/rag-load-judge-cache.json \
  --out /tmp/rag-load-summary.json \
  --report /tmp/rag-load-report.md'

# 3) 取回报告
ssh gitstars-tx 'sudo docker cp gs-llm-service:/tmp/rag-load-report.md ~/rag-load-report.md'
scp gitstars-tx:~/rag-load-report.md doc/eval/rag-loadtest-final.md
```

> 压测会为每条请求创建虚拟用户记录，跑完需清理 `user_id >= 900000` 的 `ideas` / `quota_ledger` / `usage_daily` 行。
