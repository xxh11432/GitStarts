# 深度对比评测（M5）

- 生成时间：2026-10-27T13:12:58+08:00
- 数据集：`/app/tests/eval/compare_dataset.jsonl`（3 组真实需求盲测）
- 模型：`deepseek-v4-flash`；embedding：`BAAI/bge-m3`
- schema：`v1`；每格证据 topK：6

## 汇总

| 指标 | 数值 |
| --- | --- |
| 成功用例 | 1 / 3 |
| 证据覆盖率（有证据格 / 总格） | 1.000 |
| 信息不足率 | 0.062 |
| 落库成功 | 1 / 1 |

## 逐组结果

| 用例 | 需求 | 仓库 | 证据覆盖率 | 信息不足率 | 推荐 | 耗时(ms) | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| kb-rag | 团队要私有部署一套知识库，支持中文全文检索与 RAG 问答，必须能用 Docker 自托管，最好有活跃维护。 | langgenius/dify, infiniflow/ragflow, FlowiseAI/Flowise, Mintplex-Labs/anything-llm | — | — | — | 3001 | repo_not_found: 仓库不存在：FlowiseAI/Flowise |
| automation | 想把 SaaS 与自建服务的重复操作串成可视化流程，支持定时触发和 Webhook，能自托管并接入内部 API。 | n8n-io/n8n, activepieces/activepieces, huginn/huginn, langgenius/dify | 1.00 | 0.06 | n8n-io/n8n, activepieces/activepieces | 23613 | 盲测：自动化编排场景 |
| internal-tools | 给运营搭内部工具，要能连 MySQL 和 REST API、配置权限、低代码拖拽，部署在自家服务器上。 | appsmithorg/appsmith, ToolJet/ToolJet, budibase/budibase, nocodb/nocodb | — | — | — | 3236 | repo_not_found: 仓库不存在：budibase/budibase |

## 验收口径

- 证据覆盖率低：先查该仓库 README/manifest 是否索引成功，再考虑加大 topK。
- 「信息不足」是合法结果：没有证据就不下结论；若某维度长期全线不足，应补充该维度的检索式或 manifest 抓取路径。
- 推荐命中不代表正确，盲测需人工核对许可证、部署方式与功能边界。
- 本报告必须来自真实服务运行；未运行的字段留空或标注，不得估算。
