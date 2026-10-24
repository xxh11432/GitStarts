# 语义匹配基线（M4）

## 当前状态

数据集已建立并通过格式校验，但**尚未在完整环境运行**：本机未启动 backend、Qdrant、Redis，
且 README 索引尚未构建。因此本文件暂不填写任何指标，避免用估算值冒充真实评测结果。

在完成 M4 索引的环境执行：

```bash
cd llm-service
python -m tests.eval.run_eval --limit 10
```

脚本会用真实 `/ai/match` 同款流水线（结构化 → 硬过滤 → 向量召回 + 关键词补充 → 重排）
为每条需求创建一条 `ideas` 记录（`userId=0`），并把结果覆盖写入本文件。

## 数据集

- 文件：[dataset.jsonl](../../llm-service/tests/eval/dataset.jsonl)，共 24 条需求。
- 覆盖场景：知识库/RAG、BI 看板、低代码、自动化、笔记、IM、邮件、网盘、监控、日志、
  向量库、LLM 网关、Agent、OCR、ASR、标注、爬虫、Mock、数据库客户端、搜索、CI/CD、
  API 网关、IAM。
- 每条包含 `id`、`text`、`expected`（2–3 个相关仓库 fullName）与 `notes`。
- `expected` 是人工标注的“可接受候选”，不是唯一正确答案；评测关注是否召回这些项目。

## 指标定义

- **recall@10**：命中的标注仓库数 / 该需求的标注仓库总数（最多取前 10 个候选）。
- **MRR@10**：第一个命中候选的排名倒数。
- **至少命中 1 个**：衡量完全无结果或全部跑偏的比例。

## 解读原则

1. recall 低先查索引覆盖：README 是否成功入库、分块是否过碎、硬条件是否过严。
2. recall 正常但 MRR 低，再调重排提示词与 `semantic / coverage / maintenance / license` 权重。
3. 任何“契合度”都只是排序参考；许可证、部署方式与功能边界以仓库原文为准。
4. 报告必须由脚本生成；没有真实运行结果的字段留空或标注未运行。
