# 深度对比评测（M5）

## 当前状态

数据集已建立（3 组真实需求盲测，覆盖 10 个热门项目），但**尚未在完整环境运行**：
本机未启动 backend、Qdrant、Redis，README/manifest 索引尚未构建。
因此本文件不填写任何指标，避免用估算值冒充真实结果。

在已完成 M5 索引的环境执行：

```bash
cd llm-service
python -m tests.eval.run_compare_eval
```

脚本用真实 `/ai/compare` 同款流水线（证据召回 → 仓库分析 → 单元生成 → 证据回补 →
结论合成 → 落库），以 `userId=0` 生成对比记录，并把结果覆盖写入本文件。

## 数据集

- 文件：[compare_dataset.jsonl](../../llm-service/tests/eval/compare_dataset.jsonl)
- 3 组盲测需求：知识库/RAG、自动化编排、低代码内部工具。
- 覆盖 10 个热门项目：dify、ragflow、Flowise、anything-llm、n8n、activepieces、
  huginn、appsmith、ToolJet、budibase、nocodb。
- 需求描述不点名任何仓库，避免评测被品牌词带偏。

## 指标定义

- **证据覆盖率**：有可用证据的单元格 / 总单元格。
- **信息不足率**：value 为「信息不足」的单元格比例；这是合法结果，不是错误。
- **落库成功**：`done.comparisonId` 存在的用例比例。
- **人工盲测**：对每组推荐结果核对许可证、部署方式、功能边界是否与原文一致。

## 解读原则

1. 证据覆盖率低先查索引：README 是否成功入库、manifest 是否抓取、分块是否切碎关键段落。
2. 信息不足率异常高：检查该维度检索式，或仓库确实缺少对应文档。
3. 推荐结果必须能回溯到证据；不能回溯的推荐视为缺陷。
4. 报告必须由脚本生成；未运行的字段标注「未运行」，不得估算。
