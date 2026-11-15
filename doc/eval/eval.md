# 评测手册

评测分三层：**质量**（召回 / 证据 / 对比结论）、**性能**（SSE、首屏、Lighthouse）、**可访问性**。
所有指标必须由脚本或工具真实产出；未运行就写“未运行”，不得估算或手填。

## 1. 质量评测

### 1.1 前置条件

- backend / Redis / Qdrant 已启动，且 README + manifest + repo_summary 索引完成（`index_run_finished`）
- 模型供应商可用，`.env` 中 `LLM_API_KEY` 有效
- 数据集未改动（改动需走评审并更新基线）
- 如服务器已有旧摘要但缺少 `repo_summary` 向量，先执行 `python -m worker.summary_index` 回填

### 1.2 语义匹配

```bash
cd llm-service
python -m tests.eval.run_eval \
  --dataset tests/eval/dataset40-optimized.jsonl \
  --limit 6 \
  --no-cache
```

- 数据集：[dataset40-optimized.jsonl](../../llm-service/tests/eval/dataset40-optimized.jsonl)（40 条需求；每条 `relevant` 至少 6 个库内相关仓库）
- 输出：Markdown 报告（建议写入 `doc/eval/judge40-final.md` 或带日期的报告文件）
- 指标口径：**仅 LLM-as-Judge**，`expected` 标注不参与计算
  - Hit@6：Top6 是否至少 1 个 match；宽松口径为至少 1 个 match/partial
  - Recall@6：Top6 内 match 数 ÷ 已判定候选数；宽松口径为 (match+partial) ÷ 已判定候选数
  - MRR@6：首个 match / 首个 match+partial 的倒数排名
- 2026-11-15 当前基线（子问题多路召回、query 0.8 + BM25 0.2、repoSummary 索引、多 query rerank、`rank=rerank`）：
  [judge40-final.md](judge40-final.md)
  - 40/40 成功；Hit@6（match）39/40；Hit@6（match+partial）40/40
  - Recall@6（match）0.375；Recall@6（match+partial）0.812
  - MRR@6（首个 match）0.815；MRR@6（首个 match/partial）0.975
  - 平均 match 数 2.25；平均 match+partial 数 4.88；判定分布 90/105/45
- 达标：以 `judge40-final.md` 为基线；严格 Recall@6 下降不超过 5%（相对值），且严格 Hit@6 不低于 39/40

### 1.3 深度对比

```bash
cd llm-service
python -m tests.eval.run_compare_eval
```

- 数据集：[compare_dataset.jsonl](../../llm-service/tests/eval/compare_dataset.jsonl)（3 组盲测，10 个项目）
- 输出：覆盖写入 [compare.md](compare.md)
- 指标：证据覆盖率、信息不足率、落库成功率、人工盲测结论
- 达标：证据覆盖率不低于基线；信息不足率上升需能解释为“仓库确实缺文档”；落库成功率 100%
- 每格结论必须能回溯 `sourceUrl`；不能回溯视为缺陷，不允许上线

### 1.4 何时必须重跑

- 修改 prompt、子问题拆分、召回 / 重排策略、分块策略
- 更换 embedding / rerank / chat 模型
- 调整 repoSummary 索引或重建索引、调整 manifest 抓取范围
- 对比矩阵维度、证据回补逻辑变更
- 每月至少一次例行评测

## 2. 性能评测

### 2.1 压测

SSE / Qdrant / 配额压测脚本与判定标准见 [ops.md](../deploy/ops.md) 第 4 节。
RAG 匹配链路的最新实测见 [rag-loadtest-final.md](rag-loadtest-final.md)（首字 P95 38 ms、召回平均 10.5 s、Top-1 严格 55%，稳定并发 2）；复跑用 [load_match.py](../../llm-service/tests/eval/load_match.py)。

核心门槛：

| 指标 | 门槛 |
| --- | --- |
| 核心流程错误率 | < 1% |
| 对话首包 P95 | ≤ 5s |
| 对话 / 匹配 P95 | ≤ 30s |
| 对比 P95 | ≤ 180s |
| 配额扣减 | 与成功请求数一致 |

### 2.2 前端构建体积基线（2026-10-25，Next 16.4.3 + Turbopack）

Next 16 的 Turbopack 构建不再输出分路由 `First Load JS` 表，改为记录客户端产物总量作为回归基线：

| 产物 | 体积（gzip 前） |
| --- | --- |
| `_next/static` 总量 | 1,166.5 kB（38 个文件） |
| 其中 JS（`static/chunks`） | 989.2 kB（26 个文件） |
| 其中 CSS | 52.5 kB（1 个文件） |

回归判定：`_next/static` 总量涨幅超过 10% 需解释原因；首屏体验以 Lighthouse 为准，不以原始体积单独验收。

### 2.3 Lighthouse

```bash
cd frontend
npm run build
# 本地验证可用 next start（Next 16 会提示 standalone 模式）；生产运行 node .next/standalone/server.js
npx next start -p 3000
# 另开终端
npx lighthouse http://localhost:3000 \
  --only-categories=performance,accessibility,best-practices,seo \
  --preset=desktop --output=json --output-path=./lighthouse-home.json
npx lighthouse http://localhost:3000 --preset=mobile \
  --output=json --output-path=./lighthouse-home-mobile.json
```

- 目标：Performance ≥ 85（桌面）/ ≥ 75（移动）；Accessibility ≥ 95；LCP ≤ 2.5s；CLS ≤ 0.1；INP ≤ 200ms
- 登录后页面（`/match`、`/compare`、`/me`、`/ops`）需带 Cookie 运行，或先测未登录首屏
- 本机未启动完整环境时，Lighthouse 结果需标注“降级环境（后端不可用）”，不能作为验收依据

> 当前仓库未保存 Lighthouse 报告；首次预发布环境运行后，把 JSON 与结论登记到本节，并附运行日期、设备与网络配置。

## 3. 可访问性评测

人工键盘走查（必须全部通过）：

1. Tab 从页面顶部开始，第一个焦点是「跳到主要内容」；回车后焦点落到 `main`。
2. 导航、主题切换、搜索（`Cmd/Ctrl + K`）、登录入口均可用键盘到达并触发。
3. 对话发送、匹配表单、对比表单、证据抽屉、关闭按钮均可键盘操作；Esc 能关闭浮层。
4. 焦点始终可见（`:focus-visible`），打开 Dialog 后焦点被约束在浮层内，关闭后回到触发元素。
5. 打开系统「减少动态效果」后，滚动与过渡动画被禁用（`prefers-reduced-motion`）。
6. 表单错误有文字提示且与输入框关联；图标按钮有 `aria-label`；表格有 `caption` / `scope`。

自动化（可选）：

```bash
cd frontend
npx @axe-core/cli http://localhost:3000 --exit
```

达标：无 critical/serious axe 问题；键盘走查 6 项全部通过。发现问题按组件记录，修复后复测。

## 4. 结果记录规范

每条评测记录至少包含：

```text
日期 / Git commit：
环境（模型、embedding、索引版本、容器规格）：
数据集版本：
指标（脚本原始输出）：
与基线差异：
结论 / 是否放行：
未执行项（明确写“未运行”）：
```
