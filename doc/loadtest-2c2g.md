# 2C2G 压测报告

- 日期：2026-10-25
- 代码基线：`7155f19`（docker-compose.yml 已按 1920 MiB 内存预算调整）
- 被测目标：验证整套容器在 **2 vCPU / 2 GB** 的 ECS 规格下能否稳定运行
- 结论摘要：

| 维度 | 结果 | 说明 |
| --- | --- | --- |
| 内存 | 通过 | 峰值 1256 MiB / 2048 MiB（61%），无 OOM、无重启 |
| CPU | 刚好够用 | 2 核在约 30 并发饱和，成功吞吐天花板约 35 rps |
| 稳定性 | 通过 | 全程 0 个 5xx，errorRate 0%，`oomKilled=false`、`restarts=0` |
| 前置条件 | 必须满足 | frontend 堆上限 320m + 配额 512m，否则约 20 并发必崩 |

2C2G 可以跑起来并支撑中小流量；瓶颈在 CPU 而非内存。真正上线后若访问量长期超过约 35 rps（按本次混合读请求口径），需要升到 4 核，而不是加内存。

---

## 1. 环境与约束

| 项 | 值 |
| --- | --- |
| 宿主机 | Windows + Docker Desktop，12 vCPU / 8 GiB（`MemTotal` 8121319424 B） |
| Docker | Server 29.9.2（cgroup v2） |
| 约束方式 | compose `cpus` 合计 **2.00 核**、`mem_limit` 合计 **1920 MiB** |
| 数据规模 | Qdrant 集合 23,897 条 1024 维向量（`repo_chunks_bge_m3`） |
| Embedding | `EMBEDDING_PROVIDER=api`（不在本机加载模型，符合 2 GB 部署路径） |

CPU 配额（`gs-2c-cpu.yml`，仅压测用的叠加文件，不进仓库）：

```yaml
services:
  mysql:          { cpus: 0.40 }
  redis:          { cpus: 0.05 }
  qdrant:         { cpus: 0.15 }
  backend:        { cpus: 0.60 }
  llm-service:    { cpus: 0.10 }
  ingest-worker:  { cpus: 0.05 }
  frontend:       { cpus: 0.60 }
  nginx:          { cpus: 0.05 }
# 合计 2.00 核
```

内存配额（仓库默认值，`docker compose config` 实测，合计 1920 MiB）：

| 容器 | mem_limit |
| --- | --- |
| mysql | 224m |
| redis | 96m |
| qdrant | 160m |
| backend | 448m |
| llm-service | 256m |
| ingest-worker | 192m |
| frontend | 512m |
| nginx | 32m |

> 分配思路：2 GB 里给容器 1920 MiB，留 128 MiB 给内核、页缓存与容器自身开销。

### 请求混合

压测器为纯标准库多线程 keep-alive 客户端，按权重随机取路径（合计 20 份）：

| 路径 | 权重 | 类型 |
| --- | --- | --- |
| `/api/repos?page=1&size=20&sort=stars` | 6 | API |
| `/api/repos?page=2&size=20&sort=heat` | 4 | API |
| `/api/repos/rank?type=total&limit=20` | 2 | API |
| `/api/meta` | 1 | API |
| `/api/health` | 1 | API |
| `/repos?page=1` | 3 | SSR |
| `/` | 3 | SSR |

即 14/20 走 API、6/20 走 Next.js SSR 渲染，贴近「列表页为主、首页与仓库页为辅」的真实访问结构。

---

## 2. 冷启动与空载

| 指标 | 结果 |
| --- | --- |
| 冷启动（`up -d --wait` 到全部 healthy） | **83.4 s** |
| 空载总内存（8 个容器之和） | **767 MiB** |

空载明细：

| 容器 | 空载内存 |
| --- | --- |
| backend | 266.1 MiB |
| llm-service | 147.8 MiB |
| mysql | 135.5 MiB |
| ingest-worker | 132.9 MiB |
| frontend | 39.3 MiB |
| qdrant | 30.6 MiB |
| nginx | 10.9 MiB |
| redis | 4.0 MiB |

启动时间主要花在 mysql 初始化与 backend 建连、llm-service 依赖导入；ECS 上首次拉镜像会更久，但后续重启可控制在 1 分钟内。

---

## 3. 阶梯压测

每个并发档位持续压测，期间每 3 s 采样一次 `docker stats`。

| 并发 | 请求数 | rps（含 429） | 成功 rps | p50 | p95 | p99 | 200 | 429 | 5xx | errorRate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 2123 | 46.5 | 35.3 | 3.7 ms | 794.6 ms | 933.0 ms | 1611 | 512 | 0 | 0% |
| 20 | 2367 | 51.9 | 35.2 | 2.7 ms | 1491.6 ms | 2366.7 ms | 1603 | 764 | 0 | 0% |
| 30 | 1196 | 24.1 | 23.0 | 3.0 ms | 4993.2 ms | 6794.9 ms | 1141 | 55 | 0 | 0% |

读法：

- **成功 rps 恒定为 35**（35.3 → 35.2）：这就是 2 核下的有效吞吐上限。并发从 10 加到 20 提升的全是 429，真实完成量没变。
- **c=30 是过载拐点**：rps 掉到 24.1，429 从 764 跌到 55，p95 冲到 5 s。原因是 CPU 配额被打满后请求在应用内排队，客户端实际到达率下降，连限流阈值都触不到了；此时延迟才是真正的恶化信号。
- **p50 只有 2~4 ms 与 p95 相差三个数量级**：一半请求是极快的 API 或立即返回的 429，把中位数压住；慢请求全部是 SSR 页面渲染排队，长尾由它们贡献。因此看容量必须看 p95 和成功 rps，不能看 p50。
- **429 是保护行为，不计入错误率**：Nginx 对单 IP 限 `/api/` 20 r/s（burst 40）、`/ai/` 3 r/s。压测全部流量来自同一 IP（`172.18.0.1`），所以 429 集中出现；真实用户分散在多个 IP，实际 429 比例会显著低于本次。

判定标准对照（[ops.md](./ops.md) 第 4 节）：错误率 < 1% —— 实测 0%，通过。

---

## 4. 内存峰值

| 容器 | 配额 | 空载 | 峰值 | 峰值/配额 |
| --- | --- | --- | --- | --- |
| frontend | 512m | 39.3 MiB | 396 MiB | 77% |
| backend | 448m | 266.1 MiB | 318 MiB | 71% |
| ingest-worker | 192m | 132.9 MiB | 166 MiB | 86% |
| llm-service | 256m | 147.8 MiB | 161 MiB | 63% |
| mysql | 224m | 135.5 MiB | 157 MiB | 70% |
| qdrant | 160m | 30.6 MiB | 36 MiB | 23% |
| nginx | 32m | 10.9 MiB | 13 MiB | 41% |
| redis | 96m | 4.0 MiB | 8 MiB | 8% |
| **合计** | **1920m** | **767 MiB** | **1256 MiB** | **65%** |

- 整机峰值 **1256 MiB / 2048 MiB = 61%**，余量约 790 MiB。即使真实峰值比 3 s 采样再高一截，仍有充足缓冲。
- frontend 从 39 MiB 涨到 396 MiB 是 SSR 渲染的直接成本，也是本次唯一需要「按峰值」而非「按空载」定配额的容器。
- **ingest-worker 空载即 132.9 MiB（占配额 69%）**：本轮未触发真实 GitHub 全量同步，只承担了常规心跳。192m 在真正跑同步/索引时可能偏紧，是全表最值得盯的一项；若日志出现 OOM，优先把它抬到 224m，再从 qdrant（仅用 23%）挪 32m。

---

## 5. CPU 与限流

| 容器 | 配额 | CPU 峰值 | cgroup 限流（被限流周期/总周期） |
| --- | --- | --- | --- |
| frontend | 0.60 | 0.64 | 1435 / 1502 ≈ 95% |
| backend | 0.60 | 0.59 | 408 / 2403 ≈ 17% |
| qdrant | 0.15 | — | 92 / 1029 ≈ 9% |
| llm-service | 0.10 | 0.10 | — |
| mysql | 0.40 | 0.07 | — |
| ingest-worker | 0.05 | 0.04 | — |

frontend 与 backend 双双贴在 0.60 配额上，frontend 更是 95% 的调度周期被限流 —— 这是「2 核已饱和」的直接证据，也解释了 c=30 时 p95 冲到 5 s。mysql 只用了 0.07/0.40，说明读路径的 DB 压力不大，CPU 预算可以继续向应用层倾斜（例如 backend 0.60 → 0.70、mysql 0.40 → 0.30）。

---

## 6. Qdrant 检索

| 并发 | 请求数 | p50 | p95 | 错误 |
| --- | --- | --- | --- | --- |
| 5 | 200 | 93 ms | 293 ms | 0 |
| 20 | 200 | 187 ms | 4205 ms | 0 |

检索本身在 0.15 核下可用：低并发 p95 不到 300 ms；20 并发时 p95 到 4.2 s，属于「能返回但排队明显」，与 `llm-service` 只分到 0.10 核属于同一类 CPU 饥饿现象。若 AI 匹配/对比是主打功能，需要从 mysql 挪核给 llm-service 与 qdrant。

---

## 7. 关键发现：frontend 堆溢出（已修复）

首轮使用旧配置（`NODE_OPTIONS=--max-old-space-size=128`、`mem_limit 192m`）时，20 并发下 frontend 直接崩溃：

```text
FATAL ERROR: Ineffective mark-compacts near heap limit
Allocation failed - JavaScript heap out of memory
```

容器重启，Nginx 在访问日志中记录 24 个 502。根因是 SSR 单次输出可达 200+ KB，并发渲染时 128m 老年代不够。三档梯度验证：

| 堆上限 / mem_limit | c=20 | c=30 | 结果 |
| --- | --- | --- | --- |
| 128m / 192m | 崩 | — | 堆溢出，24 个 502，容器重启 |
| 224m / 384m | 通过 | 崩 | 延后到大并发仍溢出 |
| **320m / 512m** | **通过** | **通过** | 0 错误、0 重启、0 OOM |

最终配置已写入 [docker-compose.yml](../docker-compose.yml)：`NODE_OPTIONS=--max-old-space-size=320` + `mem_limit 512m`；为守住 1920 MiB 总预算，同步把 mysql 320→224m、qdrant 320→160m、ingest-worker 288→192m（这三者实测峰值分别为 157/36/166 MiB，均有余量）。

第一轮旧配置对照（可见当时的「低 rps」其实是 CPU 只给 0.1 核造成的）：

| 并发 | rps | p95 |
| --- | --- | --- |
| 1 | 5.6 | 705 ms |
| 5 | 6.8 | 2592 ms |
| 10 | 8.9 | 4599 ms |
| 20 | 8.1 | 8299 ms |

同样在 20 并发，把 frontend 提到 0.6 核并修正堆参数后，rps 从 8.1 提升到 52、p95 从 8.3 s 降到 1.5 s。**结论：SSR 页面的成本对 CPU 配额极度敏感，2C2G 部署必须保证 frontend 至少 0.5~0.6 核。**

---

## 8. 局限与未覆盖项

1. **未覆盖 `/ai/` SSE**：chat / match / compare 需要登录 Cookie，本轮只压读路径与 SSR 页面。AI 路径的真实耗时取决于模型供应商，不在本机 CPU 预算内，需按 [ops.md](./ops.md) 第 4 节用测试账号单独压。
2. **未覆盖 ingest-worker 真实同步**：GitHub 抓取与 embedding 写入会显著抬高该容器内存与 llm-service 峰值，建议在预发布环境单独跑一次全量同步观察。
3. **单 IP 限流失真**：429 全部来自同一 IP，真实场景会分散；反过来说，本次 p95 里也混入了限流路径，比纯业务链路的结果更悲观一些。
4. **内存为 3 s 采样峰值**：瞬时尖峰可能漏采；但余量 790 MiB，不影响结论。
5. **宿主为 Docker Desktop**：CPU 配额由 cgroup v2 真实生效，但宿主后台进程可能带来轻微抖动；ECS 上无虚拟化层，结果应略好。
6. 本轮只测 CPU / 内存，**未涉及 40 GB 磁盘**。

---

## 9. 结论与建议

1. **2C2G 可用**：内存峰值 1.26 GB，8 个容器全部无 OOM、无重启，访问日志 0 个 5xx。
2. **容量的硬约束是 2 核**：混合读请求下成功吞吐约 35 rps，30 并发即饱和。日均访问量在几十万 PV 以内、峰值不超过该吞吐时可以继续用 2C2G；超过则应升 4 核（内存可维持 2 GB）。
3. **frontend 参数不要再下调**：`--max-old-space-size=320` + `512m` 是实测出来的下限，回到 128m 会在约 20 并发崩溃。
4. **CPU 预算可再优化**：mysql 实测仅用 0.07/0.40，建议把 0.1~0.2 核从 mysql 挪给 backend / llm-service / qdrant，可提升 AI 路径的 p95。
5. **上线后重点观察**：`ingest-worker` 的内存（配额余量仅 26 MiB）、frontend 的 cgroup 限流比例、Nginx 429 比例。三者分别对应内存风险、CPU 瓶颈与限流阈值是否过严。

---

## 附：复现方式

```bash
# 叠加 2 核 CPU 配额启动（内存沿用仓库默认）
docker compose -f docker-compose.yml -f gs-2c-cpu.yml up -d --wait --wait-timeout 300

# 阶梯压测：并发 10 / 20 / 30，每档 45s；脚本同时采样 docker stats 并核对 OOM
python gs_load2.py --base http://localhost --stages 10,20,30 --duration 45 --timeout 30

# Qdrant 检索（仓库自带脚本）
python deploy/loadtest/sse_load.py qdrant \
  --url http://localhost:6333 --collection repo_chunks_bge_m3 --dim 1024 \
  --concurrency 20 --requests 200
```

压测器为本次临时编写、未纳入仓库（位于系统 `%TEMP%` 下）；如需长期回归，可移入 `deploy/loadtest/`。Nginx 对单 IP 的 `limit_req` 保持默认值，未做放宽。
