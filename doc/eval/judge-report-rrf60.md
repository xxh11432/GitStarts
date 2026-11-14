# 语义匹配召回评测（M4）

- 生成时间：2026-11-14T15:52:58+08:00
- 数据集：`/eval/tests/eval/dataset.jsonl`（21 条）
- 模型：`deepseek-v4-flash`；embedding：`BAAI/bge-m3`（api，1024 维）
- rerank：`BAAI/bge-reranker-v2-m3`（双路 RRF 融合取前 60 后精排）
- 主口径：LLM-as-Judge，判断候选是否满足用户需求（match / partial / mismatch，prompt 版本 v1）
- 参考口径：标注 fullName 精确匹配（recall@10 / MRR@10）

## 汇总（相关性判定为主口径）

| 指标 | 数值 |
| --- | --- |
| 成功用例 | 21 / 21 |
| 判定成功用例 | 21 / 21 |
| 至少 1 个相关（match） | 17 / 21 |
| 至少 1 个相关或部分相关 | 21 / 21 |
| 平均严谨相关率@10（match / 已判定候选） | 0.143 |
| 平均部分相关率@10 | 0.348 |
| 平均首个相关排名（MRR） | 0.506 |
| 已判定候选数（match/partial/mismatch/未判定） | 30/73/107/0 |

## 参考：标注命中

| 指标 | 数值 |
| --- | --- |
| 至少命中 1 个标注仓库 | 13 / 21 |
| 平均 recall@10 | 0.317 |
| 平均 MRR@10 | 0.296 |
| 平均候选池 recall（进池即算命中） | 0.579 |
| 候选池至少命中 1 个标注仓库 | 16 / 21 |
| 平均候选池 | 60.0 |

## 逐条结果

| 用例 | 描述 | 相关 | 部分 | 不相关 | 首个相关 | 标注命中 | 耗时(ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| kb-private | 我想私有部署一个知识库，必须能用 Docker 自托管，支持中文全文检索，许可证要宽松一些 | 0 | 4 | 6 | — | outline/outline | 3121 |
| kb-rag | 团队要做一个基于 RAG 的文档问答系统，需要能接入自己的 PDF，最好有现成的 Web 界面 | 1 | 7 | 2 | 5 | infiniflow/ragflow | 1895 |
| bi-dashboard | 想找一个开源 BI 看板，能从 MySQL 取数并做拖拽报表，支持多数据源 | 2 | 4 | 4 | 1 | metabase/metabase, getredash/redash | 1479 |
| lowcode-form | 需要一个低代码平台，内部人员可以自己搭表单和简单审批流，支持自托管 | 2 | 5 | 3 | 5 | ToolJet/ToolJet | 1592 |
| automation | 想把 CRM、邮件和表格串起来做自动化工作流，最好是可视化编排，能自己部署 | 2 | 6 | 2 | 1 | n8n-io/n8n | 2683 |
| notes-selfhost | 找一款自托管笔记软件，支持 Markdown 和双向链接，数据要存在自己服务器 | 1 | 4 | 5 | 2 | siyuan-note/siyuan | 1615 |
| team-chat | 公司想自建内部聊天工具，要有频道、文件传输和移动端，能私有部署 | 2 | 2 | 6 | 1 | — | 1494 |
| file-sync | 想搭建私有网盘，支持文件同步、分享链接和手机客户端，开源可自托管 | 1 | 4 | 5 | 2 | syncthing/syncthing | 1459 |
| monitoring | 需要一套服务器监控和告警系统，能自定义告警规则，部署简单一点 | 0 | 2 | 8 | — | — | 1451 |
| logs | 想集中收集容器日志并做检索和看板，最好和 Grafana 生态兼容 | 2 | 2 | 6 | 1 | grafana/grafana, grafana/loki | 1474 |
| vector-db | 需要给语义检索选一个向量数据库，要求支持过滤、水平扩展，最好有 Python 客户端 | 2 | 3 | 5 | 1 | milvus-io/milvus, qdrant/qdrant | 1462 |
| llm-gateway | 想统一管理多个大模型 API，做密钥分发、额度和用量统计，能自己部署 | 3 | 3 | 4 | 1 | songquanpeng/one-api | 1413 |
| agent-framework | 开发一个多 Agent 协作应用，需要工具调用、记忆和可视化编排，语言不限 | 2 | 5 | 3 | 3 | microsoft/autogen | 1397 |
| document-ocr | 要批量解析扫描版 PDF，提取表格和段落，最好能本地部署，不一定需要界面 | 1 | 5 | 4 | 8 | — | 1513 |
| speech-to-text | 想把会议录音转成文字，要求离线可用、支持中文，最好有 GPU 加速 | 3 | 2 | 5 | 1 | openai/whisper | 1456 |
| crawler | 需要一个爬虫框架，能处理登录、分页和反爬，支持分布式调度 | 0 | 4 | 6 | — | — | 1643 |
| db-client | 找一个开源的数据库管理工具，支持 MySQL、PostgreSQL 和 SSH 隧道，桌面端更好 | 2 | 1 | 7 | 1 | — | 1542 |
| typo-search | 想给站内搜索加上拼写容错和中文分词，最好能自托管，有现成 API | 0 | 4 | 6 | — | — | 1669 |
| cicd | 想给私有 Git 仓库搭一套 CI/CD，支持流水线和 Kubernetes 部署，界面友好 | 2 | 2 | 6 | 3 | — | 1642 |
| api-gateway | 微服务需要一个开源 API 网关，支持限流、鉴权和动态路由，性能要好 | 1 | 1 | 8 | 9 | Kong/kong | 1857 |
| authz | 要给内部系统做统一登录和权限控制，支持 RBAC、OIDC 和自托管 | 1 | 3 | 6 | 3 | — | 1845 |

## 判定明细

> 理由由模型生成，仅用于审计召回质量；争议项需人工复核。

### kb-private（match 0 / partial 4 / mismatch 6）
- [mismatch] elie222/rakazo：AI 聊天机器人替代品，非知识库，无全文检索证据。
- [mismatch] xiaoyang111222/cn-math-taxonomy：教育知识图谱数据集，非可自托管知识库，且 CC BY-NC 非宽松。
- [mismatch] Heavrnl/nexus-terminal：Web SSH/RDP 终端工具，非知识库，且 GPL-3.0 非宽松许可。
- [partial] meilisearch/meilisearch：MIT 全文检索引擎可 Docker 自托管，但非知识库，中文检索证据不足。
- [mismatch] refactoringhq/tolaria：桌面端 markdown 知识库应用，非 Docker 自托管，且 AGPL-3.0。
- [mismatch] coollabsio/coolify：自托管 PaaS 部署平台，非知识库，无中文全文检索能力。
- [mismatch] awesome-selfhosted/awesome-selfhosted：自托管软件清单，非可部署知识库本身。
- [partial] outline/outline：团队知识库且支持 Docker，但许可证 NOASSERTION 未确认宽松，中文检索证据不足。
- [partial] odysseus-dev/odysseus：自托管 AI 工作区方向相关，但 AGPL-3.0 非宽松且知识库检索证据不足。
- [partial] Tencent/WeKnora：LLM 知识平台方向相关，但许可证 NOASSERTION 未确认宽松，中文全文检索证据不足。

### kb-rag（match 1 / partial 7 / mismatch 2）
- [partial] pathwaycom/serviette：无代码RAG文档问答服务器，但证据为空，Web界面与PDF接入未证实。
- [partial] PaddlePaddle/PaddleOCR：可解析PDF为结构化数据，但无RAG问答与Web界面，仅作文档解析组件。
- [mismatch] GitHubDaily/GitHubDaily：仅是开源项目资讯列表，非可部署的RAG文档问答系统。
- [partial] erupts/erupt：含erupt-ai-rag知识库与向量检索模块，但为Java低代码后台，非专门PDF问答Web系统。
- [match] infiniflow/ragflow：开源RAG引擎，支持文档接入与Web界面，契合PDF文档问答需求。
- [partial] VectifyAI/PageIndex：面向文档的推理式RAG索引，但证据未显示PDF接入与现成Web界面。
- [partial] patchy631/ai-engineering-hub：RAG教程合集，含文档问答示例，但非可直接部署的成品系统。
- [partial] ruvnet/ruflo：智能体框架含向量RAG集成，但非专门PDF文档问答Web系统。
- [mismatch] deepseek-ai/awesome-deepseek-integration：仅为DeepSeek集成资源清单，本身不是RAG问答系统。
- [partial] opendataloader-project/opendataloader-pdf：专注PDF解析为AI可用数据，无RAG问答与Web界面。

### bi-dashboard（match 2 / partial 4 / mismatch 4）
- [match] dataease/dataease：开源BI工具，支持丰富数据源连接与拖拉拽制作图表，契合需求。
- [partial] grafana/grafana：可观测性可视化平台，支持多数据源看板，但拖拽报表与BI取数证据不足。
- [match] metabase/metabase：开源BI工具，支持多数据库连接与看板，可满足取数与报表需求。
- [partial] Syngnat/GoNavi：多数据源数据库客户端，支持MySQL查询，但无BI看板与拖拽报表证据。
- [partial] getredash/redash：支持35+数据源与看板分享，但拖拽式报表能力证据不足。
- [mismatch] 1c7/chinese-independent-developer：独立开发者项目列表，非BI看板工具，不满足取数与拖拽报表需求。
- [mismatch] strapi/strapi：无头CMS，领域不符，不提供BI看板或拖拽报表。
- [mismatch] alibaba/canal：MySQL binlog增量订阅组件，属数据同步，非BI看板与拖拽报表。
- [partial] spiceai/spiceai：实时SQL查询加速引擎，非BI看板，拖拽报表能力证据不足。
- [mismatch] GitHubDaily/GitHubDaily：开源项目资讯合集，本身不是BI看板，无法取数或拖拽报表。

### lowcode-form（match 2 / partial 5 / mismatch 3）
- [mismatch] awesome-selfhosted/awesome-selfhosted：自托管软件清单，非可部署的低代码平台本身。
- [partial] YunaiV/ruoyi-vue-pro：含Flowable工作流与表单，但为Java开发框架，非低代码自助搭建。
- [partial] n8n-io/n8n：工作流自动化可自托管，但偏集成编排，非表单搭建低代码。
- [partial] YunaiV/yudao-cloud：微服务版含工作流，但偏开发框架，非低代码自助表单搭建。
- [match] ToolJet/ToolJet：低代码内部工具平台，可视化搭应用与工作流，AGPL可自托管。
- [mismatch] affaan-m/ECC：AI编码代理工具，与低代码表单审批流无关。
- [match] jeecgboot/JeecgBoot：企业级低代码平台，支持在线表单与流程设计，Apache可自托管。
- [mismatch] tphakala/birdnet-go：鸟类声音分析工具，与低代码平台无关。
- [partial] OpnForm/OpnForm：表单构建器支持自托管，但缺少审批流能力，许可证未明确。
- [partial] nocodb/nocodb：自托管低代码数据库可建表，但审批流能力证据不足。

### automation（match 2 / partial 6 / mismatch 2）
- [match] n8n-io/n8n：可视化工作流自动化平台，可自部署，400+集成覆盖CRM、邮件与表格。
- [partial] nocodb/nocodb：自部署表格与邮件等集成，但非可视化工作流编排平台，CRM能力有限。
- [partial] frappe/crm：开源可自部署CRM，但证据未显示可视化工作流编排及邮件表格自动化串联。
- [mismatch] ComposioHQ/awesome-claude-skills：仅为Claude技能资源清单，非可视化工作流编排平台，无法自部署串联CRM邮件表格。
- [partial] YunaiV/ruoyi-vue-pro：含CRM与Flowable工作流，但为Java后台系统，非可视化自动化编排串联邮件表格。
- [match] kestra-io/kestra：开源可自部署，提供可视化无代码工作流编排，可串联CRM、邮件与表格任务。
- [partial] YunaiV/yudao-cloud：含CRM与工作流模块，但微服务后台系统，缺少可视化自动化编排与邮件表格集成。
- [partial] Dolibarr/dolibarr：开源可自部署CRM/ERP，但无可视化工作流编排与邮件表格自动化串联能力。
- [mismatch] reactive-resume/reactive-resume：简历构建工具，与CRM、邮件、表格自动化工作流需求无关。
- [partial] elsa-workflows/elsa-core：有可视化工作流设计器与邮件示例，但为.NET引擎，无CRM与表格集成证据。

### notes-selfhost（match 1 / partial 4 / mismatch 5）
- [partial] usememos/memos：自托管笔记且含 Markdown 标签，但双向链接证据不足。
- [match] siyuan-note/siyuan：开源自托管，支持 Markdown 与块级双向链接，满足核心需求。
- [mismatch] awesome-selfhosted/awesome-selfhosted：仅是自托管软件清单，非笔记软件本身，无法直接选型使用。
- [mismatch] tiimgreen/github-cheat-sheet：Git/GitHub 技巧清单，与笔记软件无关。
- [partial] karakeep-app/karakeep：可自托管且支持笔记，但证据未体现 Markdown 与双向链接。
- [partial] refactoringhq/tolaria：管理 Markdown 知识库，但为桌面应用，自托管与双向链接证据不足。
- [mismatch] jaywcjlove/awesome-mac：macOS 软件清单，非自托管笔记软件，用途不符。
- [mismatch] sansan0/TrendRadar：舆情监控工具，非笔记软件，仅支持 Markdown 导出。
- [mismatch] dani-garcia/vaultwarden：密码管理器，非笔记软件，无 Markdown 与双向链接。
- [partial] lfnovo/open-notebook：笔记相关但证据不足，未确认自托管、Markdown 与双向链接。

### team-chat（match 2 / partial 2 / mismatch 6）
- [match] chattocorp/chatto：这是自托管团队聊天应用，支持频道、文件传输和移动端。
- [mismatch] 0xfurai/peekaping：这是运行状态监控工具，不是聊天工具，领域不符。
- [mismatch] jo-duchan/tapflow：这是移动端模拟器串流工具，与聊天需求无关。
- [mismatch] chatanywhere/GPT_API_free：这是大模型 API 转发服务，与内部聊天工具无关。
- [mismatch] 1c7/chinese-independent-developer：这是独立开发者项目清单，不是可部署的聊天工具。
- [partial] zhayujie/CowAgent：这是个人 AI 助手，不是团队聊天工具，缺少频道与移动端能力。
- [partial] HKUDS/nanobot：这是自托管 AI Agent 框架，不是团队聊天工具，缺少频道与文件传输能力。
- [mismatch] awesome-selfhosted/awesome-selfhosted：这是自托管软件清单，不是聊天工具本身。
- [mismatch] immich-app/immich：这是自托管照片视频管理工具，不是聊天工具。
- [match] tinode/chat：这是自托管即时通讯平台，支持频道、文件传输和 iOS/Android 客户端。

### file-sync（match 1 / partial 4 / mismatch 5）
- [partial] awesome-selfhosted/awesome-selfhosted：自托管软件清单，可作选型参考，但本身不是网盘实现。
- [match] cloudreve/cloudreve：自托管文件管理与分享系统，支持多存储与分享链接，符合私有网盘需求。
- [partial] GlassHaven/Haven：Android远程访问客户端，含SFTP/云存储，但非私有网盘服务端，缺分享链接。
- [partial] rclone/rclone：命令行云存储同步工具，缺分享链接与手机客户端，非完整网盘。
- [mismatch] makecindy/cindy：AI Agent客户端，与私有网盘文件同步分享无关。
- [mismatch] usememos/memos：自托管笔记应用，非文件网盘同步分享工具。
- [mismatch] Solido/awesome-flutter：Flutter资源清单，非网盘产品，不满足自托管需求。
- [mismatch] 1c7/chinese-independent-developer：仅是独立开发者项目列表，非网盘软件，无法自托管使用。
- [mismatch] public-apis/public-apis：免费API清单，非网盘软件，不可自托管。
- [partial] syncthing/syncthing：开源文件同步强，但缺分享链接与官方手机客户端证据，非网盘界面。

### monitoring（match 0 / partial 2 / mismatch 8）
- [mismatch] bregman-arie/devops-exercises：面试题库，非可部署的监控告警系统。
- [partial] openstatusHQ/openstatus：状态页与可用性监控，但证据不足，未见自定义告警规则与部署简易性。
- [mismatch] Arcenox-co/TickerQ：后台任务调度器，非服务器监控告警系统，领域不符。
- [mismatch] dgtlmoon/changedetection.io：网页内容变更检测，非服务器指标监控与告警。
- [mismatch] tphakala/birdnet-go：鸟类声音分析，虽含告警引擎但领域不符。
- [mismatch] koala73/worldmonitor：全球新闻情报仪表盘，非服务器监控告警。
- [mismatch] Ebony-Vinyl/dsh-our-free-model：免费模型插件，与服务器监控告警无关。
- [partial] rcourtman/Pulse：自托管基础设施监控含告警，但自定义告警规则能力证据不足。
- [mismatch] sansan0/TrendRadar：舆情热点监控，非服务器监控告警。
- [mismatch] ripienaar/free-for-dev：免费服务清单，非可部署监控系统。

### logs（match 2 / partial 2 / mismatch 6）
- [match] grafana/grafana：可可视化多源日志并做看板，原生Grafana生态，满足需求
- [match] grafana/loki：面向日志的集中收集与检索系统，Grafana生态原生兼容
- [mismatch] grpc/grpc：RPC框架，非日志收集检索或看板工具
- [mismatch] utkuozdemir/nvidia_gpu_exporter：GPU指标导出器，仅监控GPU，不处理容器日志
- [mismatch] inkonchain/node：区块链节点部署脚本，仅附带Grafana看板，非日志方案
- [partial] questdb/questdb：时序数据库可存日志并接Grafana，但非专用日志收集检索方案
- [mismatch] ASCIT31/Dark-Moon：AI渗透测试工具，与容器日志收集检索看板无关
- [partial] xerj-org/xerj：可索引日志并全文检索，但无Grafana看板集成证据
- [mismatch] strapi/strapi：无头CMS，与容器日志收集检索看板无关
- [mismatch] thingsboard/thingsboard：IoT平台，非容器日志收集检索工具

### vector-db（match 2 / partial 3 / mismatch 5）
- [match] milvus-io/milvus：云原生分布式向量库，支持标量过滤与水平扩展，提供 pymilvus 客户端。
- [mismatch] Syngnat/GoNavi：数据库客户端 GUI，仅连接向量库，非向量数据库本身。
- [partial] matrixorigin/matrixone：内置向量检索且有 Python SDK，但过滤与水平扩展证据不足。
- [mismatch] DrizzleTime/Foxel：私有云存储应用，仅调用外部向量库，本身不是向量数据库。
- [partial] ruvnet/RuVector：Rust 向量库支持元数据过滤，但水平扩展与 Python 客户端证据不足。
- [mismatch] agentscope-ai/agentscope：Agent 框架，仅通过 extras 接入外部向量库，自身非向量数据库。
- [partial] semantica-agi/semantica：Python 向量存储封装多后端，但自身非可水平扩展的独立向量数据库。
- [mismatch] VoltAgent/awesome-agent-skills：技能清单列表，非向量数据库实现。
- [mismatch] DeusData/codebase-memory-mcp：代码智能图工具，非可独立部署的向量数据库，无水平扩展能力。
- [match] qdrant/qdrant：高性能向量库，支持过滤与分布式扩展，有 Python 客户端。

### llm-gateway（match 3 / partial 3 / mismatch 4）
- [match] tbphp/gpt-load：自托管 AI 网关，多凭据统一接入，含密钥、调度、日志与用量统计。
- [match] songquanpeng/one-api：LLM API 管理与分发系统，支持 key 管理与二次分发，单文件 Docker 自部署。
- [match] QuantumNous/new-api：自托管 AI 网关，统一接入多模型并管理路由、访问、用量与成本，契合需求。
- [partial] tashfeenahmed/freellmapi：聚合免费模型与统一端点，但定位个人实验，密钥分发与额度统计证据不足。
- [mismatch] affaan-m/ECC：面向 agent harness 的性能优化系统，非 API 密钥分发与额度统计网关。
- [mismatch] KeygraphHQ/shannon：AI 渗透测试工具，非多模型 API 密钥分发与额度用量管理平台。
- [mismatch] chunxiaoxx/nautilus-compass：AI agent 记忆与评测层，非多模型 API 密钥分发与额度管理。
- [partial] piperhex/remoteai：有局域网 API Key 与额度设置，但为桌面代理工具，多模型统一管理证据不足。
- [mismatch] awesome-selfhosted/awesome-selfhosted：自托管软件清单列表，本身不是可部署的 API 管理工具。
- [partial] decolua/9router：多提供商路由与配额追踪，但定位免费编码代理，密钥分发与自部署管理证据不足。

### agent-framework（match 2 / partial 5 / mismatch 3）
- [partial] microsoft/autogen：多Agent编排框架，但仓库已归档不再维护，且许可证为CC-BY-4.0
- [partial] LodyAI/Lody：多Agent协作与编排有证据，但工具调用与记忆能力未见明确证据
- [match] HKUDS/nanobot：Python框架，描述含工具、记忆、多Agent工作流与WebUI，满足核心需求
- [mismatch] ollama/ollama：模型运行服务，非多Agent协作编排框架
- [match] ag2ai/ag2：Python多Agent框架，含编排与Agent概念，工具与记忆需确认但方向契合
- [partial] ruvnet/RuVector：含Agent记忆与协调，但为向量数据库，缺工具调用与可视化编排
- [partial] rohitg00/agentmemory：专注多Agent持久记忆，缺工具调用与可视化编排能力
- [mismatch] router-for-me/CLIProxyAPI：模型API代理服务，非多Agent应用开发框架
- [partial] Yeachan-Heo/oh-my-claudecode：多Agent编排强，但绑定Claude Code，工具调用与记忆证据不足
- [mismatch] ikaijua/Awesome-AITools：仅为AI工具清单，非可用的多Agent开发框架

### document-ocr（match 1 / partial 5 / mismatch 4）
- [partial] snapotter-hq/SnapOtter：自托管可本地OCR处理PDF，但表格与段落结构化提取未证实
- [mismatch] 1c7/chinese-independent-developer：仅为独立开发者项目列表，非可部署的PDF解析工具
- [mismatch] awesome-selfhosted/awesome-selfhosted：自托管软件清单，本身不能解析PDF
- [partial] hiroi-sora/Umi-OCR：离线批量OCR与PDF识别、CLI均满足，但表格结构化提取未证实
- [mismatch] mnemosyne-oss/mnemosyne：AI记忆库，仅附带PDF文本提取，非表格解析工具
- [partial] ocrmypdf/OCRmyPDF：本地批量OCR加文本层，但无表格与段落结构化提取
- [partial] PDFMathTranslate/PDFMathTranslate：有本地OCR与CLI，但核心是翻译，表格提取未证实
- [match] opendataloader-project/opendataloader-pdf：支持扫描PDF OCR、表格与阅读顺序提取，可本地部署
- [mismatch] THU-MAIC/OpenMAIC：多智能体教学平台，非PDF批量解析工具
- [partial] fishjar/kiss-translator：支持PDF OCR与表格解析且可本地，但定位翻译扩展，批量能力证据不足

### speech-to-text（match 3 / partial 2 / mismatch 5）
- [match] chidiwilliams/buzz：基于Whisper离线转写音视频，支持中文与GPU加速
- [match] Zackriya-Solutions/meetily：本地离线会议转写，Whisper/Parakeet支持多语言与GPU加速
- [partial] debpalash/VoiceStudio：含转写且本地CUDA，但主打TTS/克隆，转写能力证据不足
- [mismatch] lyogavin/airllm：LLM推理优化，非语音识别转写
- [mismatch] PlexPt/awesome-chatgpt-prompts-zh：中文提示词指南，非语音转写工具
- [partial] Natively-AI-assistant/natively-cluely-ai-assistant：有实时转写和多语言，但未证明离线可用及中文GPU加速
- [match] openai/whisper：Whisper离线转写，支持中文与GPU，命令行/Python可用
- [mismatch] Alishahryar1/free-claude-code：编码代理代理工具，与会议录音转写无关
- [mismatch] nestrilabs/nestri：GPU云游戏串流，与语音转写无关
- [mismatch] RVC-Boss/GPT-SoVITS：语音合成TTS，方向相反，不做录音转文字

### crawler（match 0 / partial 4 / mismatch 6）
- [mismatch] 1c7/chinese-independent-developer：独立开发者项目列表，非爬虫框架，不满足需求。
- [partial] projectdiscovery/katana：Go爬虫框架，支持认证爬取与深度控制，但未见分布式调度证据。
- [partial] D4Vinci/Scrapling：Python爬虫框架，有Spider与代理轮换，但证据未明确分布式调度。
- [mismatch] chengaopan/AutoMergePublicNodes：抓取合并免费代理节点，非通用爬虫框架。
- [mismatch] sansan0/TrendRadar：舆情热点聚合监控工具，非通用爬虫框架。
- [partial] NanmiCoder/MediaCrawler：支持登录与IP代理池，但仅限特定平台，未见分布式调度证据。
- [mismatch] josephmisiti/awesome-machine-learning：机器学习资源清单，与爬虫需求无关。
- [mismatch] VoltAgent/awesome-openclaw-skills：技能合集清单，非可用的爬虫框架。
- [partial] unclecode/crawl4ai：Python爬虫，面向LLM输出Markdown，未见分布式调度与反爬证据。
- [mismatch] apache/shardingsphere：分布式数据库中间件，与网页爬虫领域无关。

### db-client（match 2 / partial 1 / mismatch 7）
- [match] t8y2/dbx：跨平台桌面数据库客户端，支持MySQL/PostgreSQL及SSH隧道，符合需求。
- [match] TableProApp/TablePro：原生桌面数据库客户端，支持MySQL/PostgreSQL及SSH隧道，符合需求。
- [mismatch] 666ghj/BettaFish：舆情分析多Agent工具，仅使用数据库，非数据库管理客户端。
- [mismatch] serhii-londar/open-source-mac-os-apps：macOS开源应用清单，非数据库管理工具本身。
- [mismatch] awesome-selfhosted/awesome-selfhosted：自托管软件清单，非数据库管理工具本身。
- [mismatch] oobabooga/textgen：本地LLM桌面应用，与数据库管理无关。
- [mismatch] Wei-Shaw/sub2api：API中转服务，依赖PostgreSQL但非数据库管理工具。
- [mismatch] 1c7/chinese-independent-developer：独立开发者项目列表，非数据库管理工具，仅提及相关项目。
- [partial] Syngnat/GoNavi：支持MySQL/PostgreSQL的桌面数据库客户端，但证据未明确SSH隧道。
- [mismatch] lerd-env/lerd：PHP本地开发环境，非数据库管理客户端。

### typo-search（match 0 / partial 4 / mismatch 6）
- [partial] odysseus-dev/odysseus：自托管AI工作区，证据不足，无法确认拼写容错与中文分词API。
- [partial] fighting41love/funNLP：含中文词库与文本纠错资源，但为资料集合，无现成自托管搜索API。
- [partial] hankcs/HanLP：中文分词与NLP能力强，但无拼写容错搜索API，需自行封装服务。
- [mismatch] elie222/rakazo：AI聊天机器人替代品，非搜索拼写容错或中文分词组件。
- [mismatch] public-apis/public-apis：免费API清单，非可部署搜索服务，不满足自托管与分词需求。
- [partial] fxsjy/jieba：提供中文分词，但无拼写容错与现成搜索API，需自行集成。
- [mismatch] chubin/wttr.in：天气查询服务，与站内搜索、拼写容错、中文分词无关。
- [mismatch] avelino/awesome-go：仅是Go资源清单，非可部署搜索服务，无拼写容错或分词API。
- [mismatch] james-6-23/codex2api：Codex反向代理管理后台，与搜索分词容错需求无关。
- [mismatch] sequelize/sequelize：Node.js ORM，与站内搜索拼写容错和中文分词无关。

### cicd（match 2 / partial 2 / mismatch 6）
- [mismatch] veggiemonk/awesome-docker：Docker资源清单列表，非CI/CD平台本身。
- [partial] kestra-io/kestra：工作流编排支持Git版本化与CI/CD集成，但非Git托管，K8s部署证据不足。
- [match] harness/harness：端到端平台含源码管理与CI/CD流水线，支持私有仓库与K8s部署。
- [match] go-gitea/gitea：自托管Git托管含CI/CD，支持私有仓库与友好界面，可对接K8s部署。
- [mismatch] GokuMohandas/Made-With-ML：ML教学项目，非CI/CD选型产品，无Kubernetes部署平台能力。
- [partial] autobase-tech/autobase：PostgreSQL数据库平台，仅支持GitOps式配置管理，非通用CI/CD流水线。
- [mismatch] Dicklesworthstone/destructive_command_guard：仅拦截危险命令的安全工具，非CI/CD平台，无流水线与K8s部署能力。
- [mismatch] KiCad/kicad-source-mirror：EDA电路设计软件，与CI/CD流水线及K8s部署无关。
- [mismatch] ripienaar/free-for-dev：免费服务清单，非可部署的CI/CD系统。
- [mismatch] awesome-foss/awesome-sysadmin：资源清单列表，非可部署的CI/CD系统。

### api-gateway（match 1 / partial 1 / mismatch 8）
- [partial] dj-bolt/django-bolt：Python Web框架含限流鉴权路由，但非独立API网关，许可证缺失
- [mismatch] router-for-me/CLIProxyAPI：面向AI CLI模型的OpenAI兼容代理，非微服务通用API网关
- [mismatch] karanpratapsingh/system-design：系统设计教程，仅讲解限流概念，非可部署网关
- [mismatch] ashishps1/awesome-system-design-resources：系统设计学习资料清单，非可部署网关软件
- [mismatch] sorrycc/awesome-javascript：前端JS库资源列表，非API网关
- [mismatch] Wei-Shaw/sub2api：面向AI订阅中转分发，非通用微服务API网关，缺少限流鉴权动态路由证据
- [mismatch] binhnguyennus/awesome-scalability：可扩展性文章合集，非API网关实现
- [mismatch] goldbergyoni/nodebestpractices：Node.js最佳实践文档，非网关软件
- [match] Kong/kong：开源API网关，插件体系覆盖限流、鉴权、动态路由，云原生高性能，符合需求
- [mismatch] open-guides/og-aws：AWS使用指南，仅提及托管API Gateway注意事项，非开源网关

### authz（match 1 / partial 3 / mismatch 6）
- [mismatch] liketrek/TREK：旅行规划应用，OIDC仅作登录方式，非统一权限控制平台。
- [mismatch] beenuar/AiSOC：AI安全运营中心，非统一登录与权限控制IAM系统。
- [match] casdoor/casdoor：自托管IAM，明确支持OIDC、SSO与权限管理，契合统一登录需求。
- [mismatch] odysseus-dev/odysseus：自托管AI工作区，与统一登录和RBAC权限控制无关。
- [mismatch] skyhook-io/radar：Kubernetes UI工具，认证依赖外部代理，非统一登录权限系统。
- [mismatch] rustfs/rustfs：S3对象存储系统，OIDC仅用于角色映射，非IAM平台。
- [mismatch] dani-garcia/vaultwarden：密码管理器服务，仅作为OIDC客户端，非统一认证授权平台。
- [partial] panva/node-oidc-provider：OIDC授权服务器库，但RBAC权限控制与完整自托管方案证据不足。
- [partial] dromara/Sa-Token：Java鉴权框架支持SSO/OAuth2，但OIDC标准支持证据不足。
- [partial] YunaiV/ruoyi-vue-pro：支持RBAC与自托管后台，但描述未明确OIDC标准协议支持，证据不足。


## 候选池诊断

| 用例 | 分组召回仓库 | 向量仓库 | 关键词仓库 | 候选池 | 池命中 | 查询数 |
| --- | --- | --- | --- | --- | --- | --- |
| kb-private | 60 | 60 | 46 | 60 | langgenius/dify, outline/outline | 1 |
| kb-rag | 60 | 60 | 47 | 60 | infiniflow/ragflow, langgenius/dify | 1 |
| bi-dashboard | 60 | 60 | 25 | 60 | metabase/metabase, getredash/redash | 1 |
| lowcode-form | 60 | 60 | 33 | 60 | ToolJet/ToolJet, appsmithorg/appsmith | 1 |
| automation | 60 | 60 | 20 | 60 | n8n-io/n8n, activepieces/activepieces | 1 |
| notes-selfhost | 60 | 60 | 46 | 60 | siyuan-note/siyuan, laurent22/joplin, outline/outline | 1 |
| team-chat | 60 | 60 | 22 | 60 | RocketChat/Rocket.Chat | 1 |
| file-sync | 60 | 60 | 21 | 60 | syncthing/syncthing | 1 |
| monitoring | 60 | 60 | 4 | 60 | prometheus/prometheus, grafana/grafana | 1 |
| logs | 60 | 60 | 23 | 60 | grafana/loki, grafana/grafana | 1 |
| vector-db | 60 | 60 | 6 | 60 | qdrant/qdrant, milvus-io/milvus | 1 |
| llm-gateway | 60 | 60 | 24 | 60 | songquanpeng/one-api, BerriAI/litellm | 1 |
| agent-framework | 60 | 60 | 37 | 60 | microsoft/autogen | 1 |
| document-ocr | 60 | 60 | 46 | 60 | PaddlePaddle/PaddleOCR | 1 |
| speech-to-text | 60 | 60 | 20 | 60 | openai/whisper, ggml-org/whisper.cpp | 1 |
| crawler | 60 | 60 | 0 | 60 | — | 1 |
| db-client | 60 | 60 | 29 | 60 | — | 1 |
| typo-search | 60 | 60 | 20 | 60 | — | 1 |
| cicd | 60 | 60 | 60 | 60 | — | 1 |
| api-gateway | 60 | 60 | 26 | 60 | Kong/kong | 1 |
| authz | 60 | 60 | 43 | 60 | — | 1 |

## 解读

- 主口径看「相关率」与「至少 1 个相关」：它回答的是候选是否满足需求，不受标注集是否完整影响。
- 「标注命中」只作参考：标注仓库可能根本不在语料库内，低分不代表检索能力差。
- 「候选池 recall」衡量召回阶段是否把相关仓库找进池；若它明显高于 recall@K，说明问题在最终排序（fit/重排），而不在候选生成。
- 任何未实际运行的指标都应留空或标注，不得估算。
