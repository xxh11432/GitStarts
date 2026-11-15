# 语义匹配召回评测（LLM-as-Judge）

- 生成时间：2026-11-15T15:56:26+08:00
- 数据集：`tests/eval/dataset40-optimized.jsonl`（40 条）
- 模型：`deepseek-v4-flash`；embedding：`BAAI/bge-m3`（api，1024 维）
- rerank：`BAAI/bge-reranker-v2-m3`（主 query + 子问题多路 RRF 取前 60，加权 rerank）
- 指标口径：仅 LLM-as-Judge，不使用 expected 标注命中；match / partial / mismatch 由 Judge 逐候选判定
- Recall@6：match 数 ÷ 已判定候选数；宽松口径为 (match+partial) ÷ 已判定候选数
- Hit@6：Top6 是否至少有 1 个 match；宽松口径为至少 1 个 match/partial

## 汇总（LLM-as-Judge）

| 指标 | 数值 |
| --- | --- |
| 成功用例 | 40 / 40 |
| 判定成功用例 | 40 / 40 |
| Hit@6（至少 1 个 match） | 39 / 40 |
| Hit@6（至少 1 个 match/partial） | 40 / 40 |
| Recall@6（match） | 0.375 |
| Recall@6（match+partial） | 0.812 |
| MRR@6（首个 match） | 0.815 |
| MRR@6（首个 match/partial） | 0.975 |
| 平均 match 数@6 | 2.25 |
| 平均 match+partial 数@6 | 4.88 |
| 已判定候选数（match/partial/mismatch/未判定） | 90/105/45/0 |

## 逐条结果

| 用例 | 描述 | match | partial | mismatch | 首个 match | 首个可接受 | 耗时(ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| kb-rag | 团队想做一个基于 RAG 的文档问答系统，需要能接入自己的 PDF，最好有现成的 Web 界面 | 3 | 2 | 1 | 1 | 1 | 18751 |
| ai-chat-ui | 想给自己部署的模型配一个 Web 聊天界面，支持多模型切换和对话记录 | 3 | 2 | 1 | 1 | 1 | 9909 |
| llm-gateway | 想统一管理多个大模型 API，做密钥分发、额度和用量统计，能自己部署 | 4 | 2 | 0 | 1 | 1 | 11021 |
| agent-framework | 开发一个多 Agent 协作应用，需要工具调用、记忆和现成的编排框架，语言不限 | 4 | 2 | 0 | 2 | 1 | 8665 |
| mcp-tools | 想用 MCP 协议给 AI Agent 扩展工具能力，找现成的 MCP 服务器或快速搭建 MCP 服务的框架 | 2 | 4 | 0 | 1 | 1 | 15264 |
| ai-coding | 想要一个能在终端里读代码、改文件、执行命令的 AI 编程助手，最好开源可自托管 | 4 | 2 | 0 | 3 | 1 | 11711 |
| local-inference | 想在本地服务器上运行开源大模型，提供命令行或 OpenAI 兼容 API，最好支持 GPU | 2 | 4 | 0 | 3 | 1 | 11366 |
| image-gen | 想搭一个 Stable Diffusion 的文生图 Web UI，支持模型管理和插件扩展 | 2 | 2 | 2 | 1 | 1 | 10014 |
| tts | 想把文字转成语音，最好能克隆音色并支持中文 | 3 | 3 | 0 | 1 | 1 | 9848 |
| document-ocr | 要批量把扫描版 PDF 转成可搜索文本，最好能识别表格和版面，不一定需要界面 | 3 | 2 | 1 | 1 | 1 | 12046 |
| ai-workflow | 想用可视化拖拽的方式搭建 AI 工作流和 Agent 应用，最好能自托管 | 2 | 4 | 0 | 1 | 1 | 10173 |
| vector-db | 需要给语义检索选一个向量数据库，要求支持过滤、水平扩展，最好有 Python 客户端 | 2 | 3 | 1 | 1 | 1 | 9620 |
| ai-video | 想用 AI 根据脚本或素材生成短视频，最好能自动剪辑和配音 | 4 | 2 | 0 | 1 | 1 | 11372 |
| monitoring | 需要一套服务器监控和告警系统，能自定义告警规则，部署简单一点 | 3 | 3 | 0 | 1 | 1 | 9798 |
| container-ui | 需要管理多台服务器上的 Docker 容器，最好有 Web 面板能看日志和重启服务 | 1 | 3 | 2 | 1 | 1 | 10657 |
| home-automation | 想搭建家庭自动化平台，能接入各种智能设备并做自动化场景 | 2 | 2 | 2 | 1 | 1 | 9563 |
| photo-mgmt | 想自建照片管理服务，支持自动备份手机相册、人脸识别和相册分享 | 1 | 4 | 1 | 1 | 1 | 9609 |
| media-server | 想在家里搭一个影音服务器，能管理电影和音乐，支持手机 App 播放 | 1 | 5 | 0 | 1 | 1 | 9900 |
| file-sync | 想搭建私有网盘，支持文件同步、分享链接和手机客户端，开源可自托管 | 3 | 3 | 0 | 1 | 1 | 9761 |
| notes-selfhost | 找一款自托管笔记软件，支持 Markdown 和双向链接，数据要存在自己服务器 | 0 | 4 | 2 | — | 1 | 9599 |
| bookmark-manager | 想搭一个自托管的书签收藏服务，能打标签、全文搜索，最好有浏览器插件 | 4 | 2 | 0 | 1 | 1 | 8848 |
| rss-reader | 想自建一个 RSS 阅读器，支持多设备同步和全文抓取，最好能自托管 | 2 | 3 | 1 | 1 | 1 | 10085 |
| team-wiki | 想给团队搭一个内部知识库，支持 Markdown 编辑、权限控制和全文搜索 | 1 | 3 | 2 | 1 | 1 | 14795 |
| project-mgmt | 团队需要一个开源项目管理工具，支持看板、任务分配和里程碑，能自托管 | 1 | 4 | 1 | 3 | 1 | 9951 |
| lowcode-platform | 需要一个低代码平台，内部人员可以自己搭表单和简单审批流，支持自托管 | 1 | 4 | 1 | 2 | 1 | 9342 |
| automation | 想找一个开源的工作流自动化平台，能可视化编排、接 Webhook 和定时任务，最好能自托管 | 2 | 2 | 2 | 1 | 1 | 11379 |
| bi-dashboard | 想找一个开源 BI 看板，能从 MySQL 取数并做拖拽报表，支持多数据源 | 3 | 2 | 1 | 1 | 1 | 9833 |
| blog-cms | 想搭一个独立博客或内容站点，支持 Markdown 写作、主题定制和 SEO，能自己部署 | 2 | 3 | 1 | 4 | 2 | 9918 |
| team-chat | 公司想自建内部聊天工具，要有频道、文件传输和移动端，能私有部署 | 1 | 2 | 3 | 3 | 1 | 9361 |
| mail-server | 想搭建自己的邮件服务器，支持多域名、IMAP/SMTP 和反垃圾 | 4 | 0 | 2 | 1 | 1 | 9616 |
| cicd | 想给私有 Git 仓库搭一套 CI/CD 和自动化部署，支持流水线和 Kubernetes | 2 | 1 | 3 | 1 | 1 | 10154 |
| api-gateway | 微服务需要一个开源 API 网关，支持限流、鉴权和动态路由，性能要好 | 2 | 2 | 2 | 1 | 1 | 9561 |
| authz | 要给内部系统做统一登录和权限控制，支持 RBAC、OIDC 和自托管 | 1 | 4 | 1 | 1 | 1 | 9210 |
| api-testing | 团队想找一个开源 API 调试工具，支持环境变量、集合和自动化测试，最好有桌面端 | 2 | 2 | 2 | 1 | 1 | 9625 |
| diagram | 想要一个开源的在线白板和流程图工具，支持多人协作和导出图片 | 2 | 0 | 4 | 2 | 2 | 10490 |
| workflow-scheduler | 需要一套任务调度平台，能编排数据管道、支持 DAG 和定时任务 | 2 | 3 | 1 | 1 | 1 | 10090 |
| crm-erp | 公司想上一套开源的 CRM 或 ERP，管理客户、销售和财务，能自托管 | 2 | 4 | 0 | 2 | 1 | 9275 |
| analytics | 想自建网站访问统计和用户行为分析，注重隐私、能自己部署 | 4 | 2 | 0 | 1 | 1 | 11390 |
| db-client | 找一个开源的数据库管理工具，支持 MySQL、PostgreSQL 和 SSH 隧道，桌面端更好 | 2 | 1 | 3 | 2 | 1 | 11585 |
| crawler | 需要一个爬虫框架，能处理登录、分页和反爬，支持分布式调度 | 1 | 3 | 2 | 2 | 1 | 10926 |

## 判定明细

> 理由由模型生成，仅用于审计召回质量；争议项需人工复核。

### kb-rag（match 3 / partial 2 / mismatch 1）
- [match] pathwaycom/serviette：无代码 RAG 服务，可对文档文件夹问答并引用来源，适合团队直接使用。
- [partial] HKUDS/LightRAG：RAG 引擎支持文档检索，但证据未显示现成 Web 问答界面，需自行搭建。
- [partial] docling-project/docling：强于 PDF 解析，但只是文档处理库，不含 RAG 问答与 Web 界面。
- [match] Tencent/WeKnora：开源文档 RAG 平台，支持 PDF 知识库问答并引用来源，具备 Web 界面。
- [mismatch] vakovalskii/searcharvester：面向网页搜索与抓取，非自有 PDF 文档 RAG 问答系统。
- [match] infiniflow/ragflow：开源 RAG 引擎，支持复杂文档解析与知识问答，自带 Web 界面。

### ai-chat-ui（match 3 / partial 2 / mismatch 1）
- [match] lm-sys/FastChat：提供Gradio Web聊天界面，支持多模型服务与对话，Apache许可。
- [match] open-webui/open-webui：自托管AI聊天界面，支持Ollama/OpenAI多模型与对话历史，契合需求。
- [match] ChatGPTNextWeb/NextChat：Web聊天界面，兼容自部署LLM，支持多模型与对话记录，MIT许可。
- [partial] HKUDS/nanobot：有WebUI和聊天，但定位个人Agent框架，多模型切换与对话记录证据不足。
- [mismatch] f/prompts.chat：提示词库与分享平台，非模型聊天界面，不满足核心需求。
- [partial] Osmantic/ODS：集成Open WebUI可作聊天界面，但为整套部署系统，非独立轻量Web聊天选型。

### llm-gateway（match 4 / partial 2 / mismatch 0）
- [match] QuantumNous/new-api：自托管LLM网关，含访问控制、用量追踪与成本核算，契合需求
- [partial] Kong/kong：通用API/AI网关，但未明确密钥分发与额度用量统计等LLM管理能力
- [match] BerriAI/litellm：自托管AI网关，统一100+模型API，含成本追踪与密钥管理，满足核心需求
- [match] songquanpeng/one-api：自托管LLM API管理与分发系统，支持密钥管理与多模型统一适配
- [partial] shuishuipingan/qoder2api-hub：仅针对Qoder多账号反代，非通用多模型密钥分发与额度统计
- [match] tbphp/gpt-load：自托管AI网关，多凭据密钥管理、调度容错与用量统计，满足需求

### agent-framework（match 4 / partial 2 / mismatch 0）
- [partial] lioensky/VCPToolBox：声称多Agent与记忆工具，但许可证NOASSERTION且证据不足
- [match] agentscope-ai/agentscope：多Agent框架，含ReAct工具调用与记忆构建块，Python/Apache-2.0
- [match] langroid/langroid：多Agent编程，含function-calling工具与协作，Python/MIT
- [match] ag2ai/ag2：多Agent编排Network与工具调用，Python/Apache-2.0，符合需求
- [match] FoundationAgents/MetaGPT：多Agent协作框架，角色分工编排，Python/MIT，满足核心场景
- [partial] agentscope-ai/agentscope-java：多Agent框架但为Java，用户语言不限故可用，工具/记忆证据不足

### mcp-tools（match 2 / partial 4 / mismatch 0）
- [match] github/github-mcp-server：官方MCP服务器，可直接为Agent扩展GitHub工具能力，符合需求
- [partial] modelcontextprotocol/swift-sdk：官方Swift SDK可搭建MCP服务，但语言为Swift，非用户常用栈
- [partial] doobidoo/mcp-memory-service：提供MCP持久记忆服务，但仅限记忆场景，非通用工具扩展
- [partial] callstack/agent-device：有stdio MCP服务器，但仅暴露移动端自动化命令，场景受限
- [partial] DayuanJiang/next-ai-draw-io：提供MCP服务器，但仅限draw.io绘图场景，非通用工具扩展框架
- [match] upstash/context7：现成MCP服务器，为Agent提供最新文档查询工具，符合需求

### ai-coding（match 4 / partial 2 / mismatch 0）
- [partial] aspasskiy/GoGogot：自托管代理可执行命令改文件，但非专为终端读代码编程场景
- [partial] TabbyML/tabby：自托管编码助手，但偏IDE补全，未明确终端内改文件执行命令能力
- [match] google-gemini/gemini-cli：开源终端AI代理，可查询编辑代码库并执行任务，Apache-2.0
- [match] QwenLM/qwen-code：开源终端AI编程代理，可读代码、改文件、执行命令，Apache-2.0可自托管
- [match] cline/cline：开源自主编码代理含CLI，可改文件执行命令，Apache-2.0可自托管
- [match] esengine/DeepSeek-Reasonix：开源MIT终端编码代理，读代码改文件执行命令，模型可自配

### local-inference（match 2 / partial 4 / mismatch 0）
- [partial] nomic-ai/gpt4all：本地桌面应用，无OpenAI兼容API服务，且不依赖GPU
- [partial] ztxz16/fastllm：本地GPU推理库，但证据未明确提供OpenAI兼容API
- [match] vllm-project/vllm：本地部署，OpenAI兼容服务引擎，支持GPU高吞吐推理
- [partial] lyogavin/airllm：GPU低显存推理库，但未提供命令行或OpenAI兼容API服务
- [match] mudler/LocalAI：本地自托管，提供OpenAI兼容API，支持GPU，满足核心需求
- [partial] defilantech/LLMKube：支持GPU与OpenAI兼容端点，但需Kubernetes集群，非本地服务器直接运行

### image-gen（match 2 / partial 2 / mismatch 2）
- [match] AUTOMATIC1111/stable-diffusion-webui：Gradio 文生图 Web UI，README 提及扩展机制，满足模型管理与插件扩展需求
- [partial] rupeshs/fastsdcpu：面向 CPU 的 SD 桌面 GUI，有模型配置但插件扩展能力证据不足
- [mismatch] CompVis/stable-diffusion：仅为扩散模型研究代码，无 Web UI、模型管理与插件扩展能力
- [partial] leejet/stable-diffusion.cpp：纯 C++ 推理引擎，自身无 Web UI，需依赖外部 GUI 项目
- [match] Comfy-Org/ComfyUI：节点图 Web UI 支持文生图与工作流扩展，可管理模型，满足核心场景
- [mismatch] lllyasviel/ControlNet：ControlNet 控制模型研究项目，非文生图 Web UI，无模型管理与插件体系

### tts（match 3 / partial 3 / mismatch 0）
- [match] RVC-Boss/GPT-SoVITS：少样本音色克隆与TTS，中文场景常用，MIT许可
- [match] myshell-ai/OpenVoice：零样本音色克隆TTS，MIT许可，支持多语言含中文
- [partial] 2noise/ChatTTS：支持中文TTS，但证据未明确音色克隆能力，且AGPL-3.0许可证需注意
- [partial] CorentinJ/Real-Time-Voice-Cloning：支持5秒音色克隆，但证据未确认中文支持，许可证为NOASSERTION
- [match] OpenBMB/VoxCPM：多语言TTS含中文，明确支持逼真音色克隆，Apache-2.0许可
- [partial] babysor/MockingBird：支持5秒音色克隆，但源自仅英文项目，中文支持证据不足

### document-ocr（match 3 / partial 2 / mismatch 1）
- [match] opendatalab/MinerU：支持扫描PDF OCR与版面/表格解析，输出结构化文本，契合需求
- [match] ocrmypdf/OCRmyPDF：为扫描PDF加OCR文本层生成可搜索PDF，CLI批量处理，契合需求
- [match] hiroi-sora/Umi-OCR：支持批量PDF OCR并输出可搜索双层PDF，离线可用，满足需求
- [mismatch] PDFMathTranslate/PDFMathTranslate：核心是PDF翻译而非OCR转可搜索文本，不满足扫描件识别需求
- [partial] UglyToad/PdfPig：可提取文本与版面分析，但无OCR，扫描版PDF无法识别
- [partial] tesseract-ocr/tesseract：OCR引擎本身不直接处理PDF，需自行集成才能批量转可搜索文本

### ai-workflow（match 2 / partial 4 / mismatch 0）
- [match] Significant-Gravitas/AutoGPT：有可视化工作流构建器，支持自托管，可搭建AI Agent应用
- [partial] dograh-hq/dograh：有可视化工作流构建器且可自托管，但聚焦语音Agent，非通用AI工作流
- [match] n8n-io/n8n：可视化画布搭建AI Agent与工作流，支持自托管，符合核心需求
- [partial] n8n-io/self-hosted-ai-starter-kit：仅为Docker Compose模板，本身无拖拽构建器，需借助内置n8n
- [partial] windmill-labs/windmill：可自托管且支持AI Agent，但定位代码优先，拖拽可视化非核心
- [partial] kossakovsky/selfhost-ai：自托管安装器集成n8n/Flowise等，本身非拖拽构建器，需依赖子工具

### vector-db（match 2 / partial 3 / mismatch 1）
- [match] milvus-io/milvus：云原生向量数据库，支持标量过滤与分布式扩展，有Python客户端
- [match] qdrant/qdrant：向量数据库，支持过滤与分布式部署，提供Python客户端
- [partial] pingcap/tidb：分布式SQL，描述提及向量搜索，但过滤与向量检索细节证据不足
- [partial] ruvnet/RuVector：Rust向量库有元数据过滤，但水平扩展与Python客户端证据不足
- [mismatch] cockroachdb/cockroach：分布式SQL数据库，非向量数据库，无向量检索能力证据
- [partial] semantica-agi/semantica：Python向量存储支持过滤检索，但水平扩展能力证据不足

### ai-video（match 4 / partial 2 / mismatch 0）
- [match] harry0703/MoneyPrinterTurbo：按主题或关键词自动生成脚本、匹配素材、字幕与配音并合成高清短视频，完全契合。
- [match] ArcReel/ArcReel：将剧本或素材转为分镜、视频与剪映草稿，支持自动生成与后续剪辑，契合需求。
- [match] myccarl/ai-shortVideo-pipeline：端到端中文短视频流水线，覆盖创意、画面、音频与后期，满足脚本生成与自动剪辑配音。
- [match] dramaclaw/dramaclaw：从剧本到成片一条流水线，覆盖短剧与短视频生成，契合脚本转视频需求。
- [partial] darkzOGx/youtube-automation-agent：能生成旁白、画面并合成MP4，但面向YouTube频道全流程，未明确自动剪辑与配音细节。
- [partial] glanderness/BeefTV：画布式AI视频创作工作台，偏素材与生成编排，未明确脚本自动剪辑配音能力。

### monitoring（match 3 / partial 3 / mismatch 0）
- [match] henrygd/beszel：轻量服务器监控，含历史数据与可配置告警，开箱即用部署简单。
- [match] kOlapsis/maintenant：单 Go 二进制自托管监控，含告警引擎与规则，部署简单。
- [partial] louislam/uptime-kuma：主打可用性/uptime 监控，服务器指标与自定义告警规则能力有限。
- [partial] rcourtman/Pulse：面向 Proxmox/Docker 等基础设施仪表盘，自定义告警规则证据不足。
- [partial] highlight/highlight：偏全栈 APM/错误监控，服务器指标告警非核心，许可证未明确。
- [match] ccfos/nightingale：自托管告警系统，支持按数据源自定义告警规则，Go 单二进制部署简单。

### container-ui（match 1 / partial 3 / mismatch 2）
- [match] Quenary/tugtainer：Web UI 支持多主机与容器更新，含日志与手动操作，满足多服务器管理需求。
- [partial] dockpeek/dockpeek：有 Web 面板、实时日志与多主机，但重启服务能力未在证据中体现。
- [mismatch] jesseduffield/lazydocker：终端 TUI 而非 Web 面板，且无多服务器集中管理能力。
- [partial] basnijholt/compose-farm：支持多主机 compose 操作，但 Web UI 仅限资源统计，日志与重启能力证据不足。
- [partial] intelligentwolf/WolfStack：Web 面板管理多服务器 Docker 容器，但许可证为 NOASSERTION，日志与重启证据不足。
- [mismatch] WisdomSky/Cloudflared-web：仅管理 Cloudflare 隧道，不提供多服务器 Docker 容器管理或日志重启功能。

### home-automation（match 2 / partial 2 / mismatch 2）
- [match] home-assistant/core：开源家庭自动化平台，本地控制隐私优先，支持海量设备接入与自动化场景。
- [mismatch] ruvnet/RuView：基于WiFi的感知/生命体征监测系统，非设备接入与场景自动化平台。
- [mismatch] denysdovhan/smart-home：个人homelab配置示例，非可部署的自动化平台产品，无法直接选型使用。
- [match] GladysAssistant/Gladys：开源家庭助手平台，支持多设备接入与自动化场景，隐私优先，可装于树莓派/NAS。
- [partial] OpenCCU/OpenCCU：面向Homematic IP CCU的专用平台，设备接入范围受限，非通用多品牌自动化平台。
- [partial] make-all/tuya-local：仅为Home Assistant的涂鸦设备本地接入集成，非独立平台，设备品牌单一。

### photo-mgmt（match 1 / partial 4 / mismatch 1）
- [match] immich-app/immich：自建照片管理，移动端自动备份、人脸识别与相册分享均具备。
- [partial] LibrePhotos/librephotos：明确支持人脸识别与自建管理，但证据未提及手机相册自动备份与分享。
- [partial] photoview/photoview：自建相册与分享可用，但证据未显示人脸识别和手机相册自动备份。
- [partial] HoshinoSuzumi/chronoframe：有相册浏览与分享，但证据未显示手机自动备份和人脸识别能力。
- [partial] photoprism/photoprism：AI 照片管理与分享具备，但许可证为 NOASSERTION，且手机自动备份证据不足。
- [mismatch] SmilyOrg/photofield：仅本地文件系统浏览型相册，无人脸识别、手机自动备份或分享功能。

### media-server（match 1 / partial 5 / mismatch 0）
- [match] kaybi-gh/K7：自托管影视音乐服务器，支持流媒体转码与播放列表，契合家庭影音需求。
- [partial] BleedingXiko/GhostHub：仅面向树莓派4的照片视频库，缺少音乐管理与手机App播放证据。
- [partial] HolyArrs/HolyArrs：整合下载与媒体管理，覆盖影视音乐，但播放依赖Plex/Jellyfin，非自带播放。
- [partial] Jstudner/jcorp-nomad：ESP32离线便携服务器，覆盖影视音乐书籍，但家用影音管理与手机App证据不足。
- [partial] rdborg/Mediarium：媒体搜索下载整理工具，播放依赖Plex/Jellyfin，非自带播放服务。
- [partial] navidrome/navidrome：专注音乐流媒体且支持手机端，但缺少电影管理能力。

### file-sync（match 3 / partial 3 / mismatch 0）
- [match] Sync-in/server：自托管文件存储、同步与分享，含Docker部署，方向与硬条件均满足
- [match] cloudreve/cloudreve：自托管文件管理与分享，支持多存储后端，满足私有网盘核心需求
- [partial] projectsend/projectsend：面向客户的文件分发分享，缺少文件同步与手机客户端证据
- [partial] hbons/SparkleShare：基于Git的同步客户端，缺少网盘式分享链接与服务端管理能力
- [match] owncloud/core：自托管文件存储、同步与分享，含WebDAV，满足私有网盘需求
- [partial] eikek/sharry：仅做文件上传分享链接，缺少文件同步与手机客户端证据

### notes-selfhost（match 0 / partial 4 / mismatch 2）
- [partial] usememos/memos：自托管Markdown笔记，但双向链接能力证据不足。
- [partial] fccview/jotty：自托管文件存储笔记，支持Markdown，但双向链接证据不足。
- [partial] Smaug6739/Alexandrie：自托管Markdown知识库，但证据未明确支持双向链接。
- [partial] nikunjsingh93/react-glass-keep：自托管笔记应用，但Markdown与双向链接能力证据不足。
- [mismatch] sissbruecker/linkding：自托管书签管理器，非笔记软件，无双向链接。
- [mismatch] Kovah/LinkAce：自托管书签归档工具，非笔记软件，无Markdown笔记与双向链接证据。

### bookmark-manager（match 4 / partial 2 / mismatch 0）
- [match] linkwarden/linkwarden：自托管书签管理，支持标签与全文搜索，有浏览器扩展，满足核心需求。
- [match] karakeep-app/karakeep：自托管书签应用，支持标签、全文搜索，并有浏览器扩展；核心需求满足。
- [partial] beromir/Servas：自托管书签管理，支持标签和分组；全文搜索与浏览器插件无证据。
- [match] sissbruecker/linkding：自托管书签管理，支持标签、全文搜索和浏览器扩展，Docker部署，满足需求。
- [match] Kovah/LinkAce：自托管书签归档，支持列表和标签，Docker部署；全文搜索与浏览器插件证据不足。
- [partial] haishanh/cherry：自托管书签服务，但标签、全文搜索、浏览器插件均无明确证据。

### rss-reader（match 2 / partial 3 / mismatch 1）
- [match] babarot/oksskolten：自托管 RSS 阅读器，README 明确自动抓取全文，满足自托管与全文抓取需求。
- [match] FreshRSS/FreshRSS：自托管 RSS 聚合阅读器，支持多用户与阅读同步；全文抓取需插件，但核心场景满足。
- [partial] lcomplete/huntly：自托管信息中心含 RSS 阅读，但多设备同步与全文抓取能力证据不足。
- [partial] prof18/feed-flow：多平台 RSS 阅读器客户端，但非自托管服务端，自托管与全文抓取不满足。
- [mismatch] DIYgod/RSSHub：RSSHub 是生成 RSS 源的工具，不是阅读器，缺少阅读、多设备同步与全文抓取能力。
- [partial] glanceapp/glance：自托管仪表盘聚合 feed，非完整 RSS 阅读器，缺少多设备阅读同步与全文抓取证据。

### team-wiki（match 1 / partial 3 / mismatch 2）
- [match] Smaug6739/Alexandrie：自托管知识库，扩展Markdown编辑，团队工作区与细粒度访问控制，支持搜索。
- [partial] siyuan-note/siyuan：Markdown知识库与全文搜索强，但团队权限控制证据不足，且AGPL许可证。
- [mismatch] waynesutton/markdown-site：面向AI代理的Markdown发布框架，非内部知识库，缺权限控制。
- [partial] Zavy86/WikiDocs：Markdown扁平文件wiki，但证据未体现权限控制与全文搜索能力。
- [partial] oxynote/oxynote：内部文档与全文搜索具备，但Markdown编辑与权限控制证据不足。
- [mismatch] tinacms/tinacms：面向网站内容的无头CMS，非团队内部知识库，缺权限与全文搜索。

### project-mgmt（match 1 / partial 4 / mismatch 1）
- [partial] plankanban/planka：自托管看板与任务分配满足，但许可证为NOASSERTION且里程碑证据不足。
- [partial] kanboard/kanboard：自托管看板与任务分配满足，但已进入维护模式，里程碑能力证据不足。
- [match] usekaneo/kaneo：开源自托管，看板、任务分配与Gantt/里程碑视图齐备，MIT许可。
- [partial] wekan/wekan：自托管看板与任务分配满足，但里程碑能力证据不足。
- [mismatch] BloopAI/vibe-kanban：面向编码智能体的看板，非团队项目管理，缺任务分配与里程碑。
- [partial] Smaug6739/Alexandrie：知识库/笔记为主，看板仅附带，缺任务分配与里程碑证据。

### lowcode-platform（match 1 / partial 4 / mismatch 1）
- [partial] OpnForm/OpnForm：表单搭建强，但无审批流证据，许可证未明确，自托管未确认
- [match] r3-team/r3：低代码平台，含表单、工作流、自托管，契合内部审批需求
- [partial] illacloud/illa-builder：低代码内部工具强，但表单审批流能力证据不足
- [partial] TotallyInformation/node-red-contrib-uibuilder：低代码UI构建，但无表单/审批流核心能力，需Node-RED
- [partial] staringos/tefact：表单/H5编辑器相关，但无审批流，许可证缺失
- [mismatch] frappe/builder：网站页面可视化构建器，非表单与审批流低代码平台

### automation（match 2 / partial 2 / mismatch 2）
- [match] n8n-io/n8n：可视化编排、Webhook 与定时触发、可自托管，满足核心需求；许可证为 fair-code。
- [mismatch] kossakovsky/selfhost-ai：仅为自托管 AI 工具栈的一键安装脚本，本身不是工作流自动化平台。
- [partial] windmill-labs/windmill：可自托管、支持定时与 Webhook 类触发，但以代码优先为主，可视化编排证据不足。
- [match] kestra-io/kestra：可视化构建工作流、事件驱动支持 Webhook、定时调度，且开源可自托管。
- [mismatch] n8n-io/self-hosted-ai-starter-kit：只是 Docker Compose 模板，用于搭建 AI 环境，本身不是工作流自动化平台。
- [partial] dagucloud/dagu：可自托管、支持 cron 定时与 DAG，但以 YAML 声明式为主，缺可视化编排与 Webhook 证据。

### bi-dashboard（match 3 / partial 2 / mismatch 1）
- [match] frappe/insights：开源BI，支持连接多数据库与文件，查询构建器可做报表看板。
- [match] TuiQiao/CBoard：开源BI看板，README明确支持拖拽式OLAP报表与多数据集，方向与需求吻合。
- [match] dataease/dataease：开源BI工具，支持丰富数据源连接与可视化看板，满足取数与多源需求。
- [partial] getredash/redash：支持35+数据源含MySQL与看板，但拖拽式报表能力证据不足。
- [mismatch] perspective-dev/perspective：是数据网格/透视表前端组件，非完整BI看板平台，无MySQL取数。
- [partial] lightdash/lightdash：开源BI看板，但依赖dbt语义层，未证明原生MySQL取数与拖拽报表。

### blog-cms（match 2 / partial 3 / mismatch 1）
- [mismatch] rikhuijzer/bloglite：定位为类似Twitter的微博客公共笔记本，非Markdown主题化博客站点。
- [partial] jlelse/GoBlog：Markdown优先且可自部署，但明确无主题系统，缺主题定制硬需求。
- [partial] waynesutton/markdown-site：支持Markdown发布，但依赖Convex/Netlify云服务，自部署与主题定制证据不足。
- [match] rochacbruno/marmite：Markdown静态博客生成器，单二进制自部署，支持配置与主题，契合需求。
- [match] gma/nesta：文件型CMS/静态站，支持Markdown写作、主题定制与自部署，契合博客需求。
- [partial] givanz/Vvveb：CMS可建博客，但证据未确认Markdown写作与SEO能力，且为HTML/PHP动态部署。

### team-chat（match 1 / partial 2 / mismatch 3）
- [partial] chattocorp/chatto：可自托管团队聊天，但证据未明确频道、文件传输及移动端支持。
- [partial] agentes-chat/agentes-chat：自托管Slack替代品有频道，但证据未明确文件传输与移动端能力。
- [match] RocketChat/Rocket.Chat：开源可私有部署的团队通信平台，支持频道与文件传输，有移动端，符合需求。
- [mismatch] nilsteampassnet/TeamPass：自托管团队密码管理器，非聊天工具，领域不符。
- [mismatch] chatwoot/chatwoot：面向客户支持的客服工单平台，非内部团队频道聊天工具。
- [mismatch] cogwheel0/conduit：仅为AI聊天移动客户端，无团队频道与私有部署聊天服务端。

### mail-server（match 4 / partial 0 / mismatch 2）
- [match] mailez-hq/mailez：自托管邮件服务器，支持 SMTP/IMAP/POP3、自有域名与反垃圾，Docker Compose 部署。
- [match] jeboehm/docker-mailserver：自托管邮件服务器，明确支持 IMAP、SMTP、反垃圾及多域名，MIT 许可。
- [match] Mailu/Mailu：Docker 邮件服务器，支持 IMAP、SMTP、多域名及反垃圾（DKIM/DMARC），满足核心需求。
- [match] mailcow/mailcow-dockerized：Docker 化完整邮件系统，含 Dovecot IMAP、SMTP、多域名与 ClamAV 反垃圾。
- [mismatch] rustmailer/bichon：邮件归档工具，仅从 IMAP 拉取归档，非可搭建的收发邮件服务器。
- [mismatch] rustmailer/rustmailer：面向开发者的邮件中间件，非完整邮件服务器，不提供多域名收发自建。

### cicd（match 2 / partial 1 / mismatch 3）
- [match] kubero-dev/kubero：自托管 Kubernetes PaaS，支持从源码/容器部署与 CI/CD，契合私有仓库自动化部署。
- [mismatch] mlrun/mlrun：MLOps 平台，CI/CD 仅服务于 ML 流水线，非通用 CI/CD 部署需求。
- [mismatch] autobase-tech/autobase：面向 PostgreSQL 数据库自动化，非通用 CI/CD 流水线平台，领域不符。
- [mismatch] keploy/keploy：API 测试与 mock 工具，仅可接入 CI，非 CI/CD 与部署平台。
- [match] devtron-labs/devtron：Kubernetes 端到端 CI/CD 流水线，支持 Helm/GitOps 与多集群部署，契合需求。
- [partial] khuedoan/homelab：GitOps 与 Kubernetes 自动化自托管，但偏家庭实验室，非私有 Git 仓库 CI/CD 流水线。

### api-gateway（match 2 / partial 2 / mismatch 2）
- [match] Kong/kong：云原生API网关，README明确支持路由、负载均衡与鉴权，限流为插件能力，满足核心需求。
- [match] traefik/traefik：Go云原生反向代理，自动动态路由，支持中间件限流与鉴权，性能好。
- [partial] zeromicro/go-zero：Go微服务框架含gateway组件，但非独立API网关，限流鉴权需自行集成。
- [partial] alibaba/Sentinel：仅Java流控库，提供限流熔断，但无API网关、鉴权与动态路由能力。
- [mismatch] dromara/Sa-Token：Java鉴权框架，非API网关，缺少限流与动态路由能力。
- [mismatch] QuantumNous/new-api：面向LLM的AI网关，路由与访问控制针对模型服务，非微服务通用API网关。

### authz（match 1 / partial 4 / mismatch 1）
- [match] casdoor/casdoor：自托管 IAM，支持 OIDC 与 RBAC，Apache-2.0，满足统一登录与权限控制需求
- [partial] voidauth/voidauth：自托管 SSO 与 OIDC 提供商，但 RBAC 权限控制证据不足
- [partial] tinyauthapp/tinyauth：自托管 OIDC 认证与访问控制，但 RBAC 细粒度权限证据不足
- [partial] pocket-id/pocket-id：自托管 OIDC 提供商，但证据未体现 RBAC 权限控制能力
- [partial] fosrl/pangolin：有 OIDC 与 RBAC，但核心是反向代理与网络访问，许可证未明示
- [mismatch] crocodilestick/Calibre-Web-Automated：电子书库管理工具，仅附带 OIDC 登录，非统一身份与权限控制平台

### api-testing（match 2 / partial 2 / mismatch 2）
- [match] usebruno/bruno：开源桌面API IDE，支持环境变量、集合及CLI自动化测试。
- [match] Kong/insomnia：跨平台桌面API客户端，支持环境变量、集合与自动化测试。
- [partial] keploy/keploy：API测试平台，但非调试客户端，无桌面端与环境变量集合证据。
- [partial] httpie/cli：命令行HTTP客户端，非桌面端，环境变量与集合能力证据不足。
- [mismatch] callstack/agent-device：移动设备自动化层，非API调试工具，无环境变量与集合。
- [mismatch] KeygraphHQ/shannon：AI渗透测试工具，非API调试客户端，无环境变量/集合/桌面端。

### diagram（match 2 / partial 0 / mismatch 4）
- [mismatch] wekan/wekan：开源看板任务管理工具，非白板/流程图，用途不符。
- [match] excalidraw/excalidraw：开源虚拟白板，支持手绘流程图与协作，可导出图片，核心需求满足。
- [mismatch] apitable/apitable：低代码表格/数据库平台，非白板或流程图工具，用途不符。
- [mismatch] suitenumerique/docs：协作文档文本编辑器，非白板或流程图工具，用途不符。
- [mismatch] plankanban/planka：自托管看板项目管理工具，非白板/流程图，用途不符。
- [match] ZimengXiong/ExcaliDash：自托管Excalidraw白板，支持实时协作与分享，可导出图片，满足核心需求。

### workflow-scheduler（match 2 / partial 3 / mismatch 1）
- [match] apache/airflow：Python平台，以DAG编排、调度和监控工作流，完全契合需求。
- [match] dagucloud/dagu：自托管DAG工作流引擎，支持cron定时、依赖与数据管道编排。
- [partial] Arcenox-co/TickerQ：有定时任务与可视化工作流，但描述未明确支持数据管道DAG编排，证据不足。
- [partial] xuxueli/xxl-job：分布式定时任务调度强，但缺少数据管道DAG编排能力。
- [partial] airbytehq/airbyte：专注ELT数据搬运与连接器，缺少DAG编排和定时调度能力。
- [mismatch] open-multi-agent/open-multi-agent：面向AI代理编排，非数据管道DAG与定时任务调度平台。

### crm-erp（match 2 / partial 4 / mismatch 0）
- [partial] shyamsitaula/samarium：含CRM/ERP/财务但仍在开发中(0.9.6)，成熟度证据不足。
- [match] frappe/erpnext：开源ERP，含会计、订单、CRM，可自托管，覆盖客户销售财务。
- [partial] ilscipio/scipio-erp：偏电商框架，许可证未明(NOASSERTION)，财务与CRM覆盖证据不足。
- [match] odoo/odoo：开源业务应用套件，含CRM与ERP财务，可自托管，满足需求。
- [partial] frappe/crm：开源自托管CRM，但仅覆盖客户与销售，缺少财务/ERP能力。
- [partial] melgarafael/DeskcommCRM：自托管CRM但聚焦WhatsApp聊天销售，缺财务/ERP能力。

### analytics（match 4 / partial 2 / mismatch 0）
- [match] Countly/countly-server：隐私优先、可自托管，覆盖网站与用户行为分析；许可证未明示但未构成硬性排除。
- [partial] medama-io/medama：自托管无Cookie网站分析，但许可证缺失，行为分析能力证据不足。
- [partial] explodingcamera/liwan：自托管隐私网站统计，但仅页面/来源/趋势，缺少用户行为分析深度证据。
- [match] Swetrix/swetrix：隐私优先无Cookie网站分析，含自定义事件、漏斗、会话回放，AGPL可自托管。
- [match] umami-software/umami：隐私优先无Cookie，含行为、转化、留存分析，MIT可自托管，契合需求。
- [match] plausible/analytics：隐私优先无Cookie网站分析，AGPL可自托管，满足自建统计核心需求。

### db-client（match 2 / partial 1 / mismatch 3）
- [partial] TableProApp/TablePro：原生macOS客户端支持MySQL/PostgreSQL，但仅限macOS且证据未提SSH隧道
- [match] Syngnat/GoNavi：桌面数据库客户端，内置MySQL/PostgreSQL，证据未明确SSH隧道但为多数据源GUI，基本满足
- [match] t8y2/dbx：轻量跨平台桌面客户端，支持MySQL/PostgreSQL及SSH隧道，完全满足
- [mismatch] databasus/databasus：PostgreSQL备份与恢复工具，非数据库管理客户端
- [mismatch] autobase-tech/autobase：PostgreSQL集群部署DBaaS平台，非数据库管理GUI客户端
- [mismatch] directus/directus：无头CMS/后端API平台，非桌面数据库管理工具

### crawler（match 1 / partial 3 / mismatch 2）
- [partial] D4Vinci/Scrapling：具备爬虫框架、反爬与并发能力，但证据未明确支持分布式调度。
- [match] scrapy/scrapy：成熟爬虫框架，支持登录、分页、反爬扩展，分布式可通过组件实现。
- [mismatch] xuxueli/xxl-job：通用分布式任务调度平台，非网页爬虫框架，无爬取能力。
- [partial] germondai/trawl：擅长反爬与验证码绕过，但无分布式调度与登录分页框架能力证据。
- [mismatch] Kaliiiiiiiiii-Vinyzu/patchright：仅为反检测浏览器自动化库，非爬虫框架，无分布式调度。
- [partial] Gerapy/Gerapy：基于Scrapy的分布式爬虫管理，但登录/分页/反爬需依赖Scrapy生态，证据不足。


## 候选池诊断

| 用例 | 分组召回仓库 | 向量仓库 | 关键词仓库 | 候选池 | 子问题数 | RRF 权重 | 查询数 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| kb-rag | 180 | 131 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| ai-chat-ui | 180 | 136 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| llm-gateway | 240 | 122 | 60 | 60 | 4 | 0.20/0.20/0.20/0.20/0.20 | 4 |
| agent-framework | 120 | 87 | 60 | 60 | 2 | 0.40/0.40/0.20 | 2 |
| mcp-tools | 180 | 100 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| ai-coding | 180 | 113 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| local-inference | 240 | 137 | 60 | 60 | 4 | 0.20/0.20/0.20/0.20/0.20 | 4 |
| image-gen | 180 | 121 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| tts | 180 | 114 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| document-ocr | 240 | 133 | 60 | 60 | 4 | 0.20/0.20/0.20/0.20/0.20 | 4 |
| ai-workflow | 180 | 119 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| vector-db | 180 | 129 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| ai-video | 240 | 98 | 60 | 60 | 4 | 0.20/0.20/0.20/0.20/0.20 | 4 |
| monitoring | 180 | 115 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| container-ui | 180 | 132 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| home-automation | 180 | 117 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| photo-mgmt | 180 | 115 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| media-server | 180 | 102 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| file-sync | 180 | 127 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| notes-selfhost | 180 | 125 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| bookmark-manager | 180 | 106 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| rss-reader | 180 | 101 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| team-wiki | 120 | 102 | 60 | 60 | 2 | 0.40/0.40/0.20 | 2 |
| project-mgmt | 180 | 133 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| lowcode-platform | 180 | 123 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| automation | 240 | 126 | 60 | 60 | 4 | 0.20/0.20/0.20/0.20/0.20 | 4 |
| bi-dashboard | 180 | 131 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| blog-cms | 180 | 144 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| team-chat | 180 | 126 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| mail-server | 180 | 104 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| cicd | 180 | 115 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| api-gateway | 180 | 106 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| authz | 180 | 109 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| api-testing | 180 | 155 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| diagram | 180 | 115 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| workflow-scheduler | 180 | 153 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| crm-erp | 180 | 108 | 60 | 60 | 3 | 0.27/0.27/0.27/0.20 | 3 |
| analytics | 240 | 139 | 60 | 60 | 4 | 0.20/0.20/0.20/0.20/0.20 | 4 |
| db-client | 240 | 134 | 60 | 60 | 4 | 0.20/0.20/0.20/0.20/0.20 | 4 |
| crawler | 240 | 165 | 60 | 60 | 4 | 0.20/0.20/0.20/0.20/0.20 | 4 |

## 解读

- Hit@6 衡量 Top6 是否至少有一个可直接选型的 match；宽松口径把 partial 也视为可用线索。
- Recall@6 的分母是已判定候选数（通常等于 Top6），因此它反映 TopK 内相关候选的占比，不依赖人工标注全集。
- 未判定候选会计入 unknown，不进入 Recall 分母；判定失败需单独看错误列。
- 任何未实际运行的指标都应留空或标注，不得估算。
