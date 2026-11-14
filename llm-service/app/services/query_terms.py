"""Query 清洗与术语归一化：把中文/口语表达统一成 GitHub 常用英文术语。"""

from __future__ import annotations

import re

# 中文/别名 → GitHub 常用英文术语。按长度倒序匹配，避免短词先替换掉长词。
TERM_ALIASES: dict[str, str] = {
    "知识库": "knowledge base",
    "文档问答": "document QA",
    "私有部署": "self-hosted",
    "私有化部署": "self-hosted",
    "私有化": "self-hosted",
    "自托管": "self-hosted",
    "本地部署": "self-hosted",
    "网盘": "file sync",
    "文件同步": "file sync",
    "团队聊天": "team chat",
    "内部聊天": "instant messaging",
    "即时通讯": "instant messaging",
    "低代码": "low-code",
    "零代码": "no-code",
    "看板": "dashboard",
    "拖拽报表": "drag-and-drop reporting",
    "自动化工作流": "workflow automation",
    "可视化编排": "visual workflow",
    "监控告警": "monitoring alerting",
    "服务器监控": "server monitoring",
    "日志检索": "log search",
    "日志收集": "log management",
    "向量数据库": "vector database",
    "语义检索": "semantic search",
    "大模型网关": "LLM gateway",
    "模型网关": "LLM gateway",
    "多智能体": "multi-agent",
    "智能体": "agent",
    "扫描件": "scanned document",
    "表格提取": "table extraction",
    "语音转文字": "speech-to-text",
    "会议录音": "meeting transcription",
    "爬虫框架": "crawler framework",
    "爬虫": "crawler",
    "反爬": "anti-crawling",
    "分布式调度": "distributed scheduling",
    "流水线": "pipeline",
    "接口网关": "API gateway",
    "API网关": "API gateway",
    "限流": "rate limiting",
    "动态路由": "dynamic routing",
    "统一登录": "SSO",
    "单点登录": "SSO",
    "权限控制": "RBAC",
    "中文分词": "Chinese tokenization",
    "中文全文检索": "Chinese full-text search",
    "拼写容错": "fuzzy search",
    "模糊搜索": "fuzzy search",
    "苹果手机": "iPhone",
    "安卓手机": "Android",
    "鸿蒙": "HarmonyOS",
    "浏览器插件": "browser extension",
    "桌面端": "desktop app",
    "移动端": "mobile app",
    "开源": "open source",
    "自建": "self-hosted",
}

# 泛词不进入 query 和关键词，避免召回被“工具/平台/开源”这类词稀释。
GENERIC_TERMS = {
    "tool",
    "tools",
    "platform",
    "software",
    "application",
    "app",
    "system",
    "open source",
    "开源",
    "工具",
    "平台",
    "软件",
    "系统",
    "应用",
    "方案",
}

# 口语填充词，只做删除，不影响否定与硬条件。
_FILLER_PATTERNS = [
    r"我想(?:找|要|做)?(?:一个|一款|一套)?",
    r"我需要(?:一个|一款|一套)?",
    r"帮我(?:找|推荐|看看)(?:一个|一款|一套)?",
    r"有没有(?:一个|一款|一套)?",
    r"最好是?",
    r"最好能",
    r"尽量",
    r"麻烦",
    r"谢谢",
    r"一点",
    r"一些",
    r"比较",
    r"非常",
    r"而且",
    r"然后",
    r"呢",
    r"吗",
]
_FILLER_RE = re.compile("|".join(_FILLER_PATTERNS))
_WHITESPACE_RE = re.compile(r"\s+")
# 检索链路只接受英文：CJK 字符一律从 query / keyword 中剔除
_CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]")
_ENGLISH_RE = re.compile(r"[A-Za-z]")
_ALIAS_ITEMS = sorted(TERM_ALIASES.items(), key=lambda item: len(item[0]), reverse=True)


def has_english(text: str) -> bool:
    return bool(_ENGLISH_RE.search(text or ""))


def strip_non_english(text: str) -> str:
    """去掉 CJK 字符并压缩空白，保证 query 全英文。"""
    return _WHITESPACE_RE.sub(" ", _CJK_RE.sub(" ", text or "")).strip()


def clean_user_text(text: str) -> str:
    """去掉口语填充词，保留否定、硬条件与专有名词。"""
    if not text:
        return ""
    cleaned = _FILLER_RE.sub(" ", text)
    cleaned = re.sub(r"[，。！？、；：,.!?;:]+", " ", cleaned)
    return _WHITESPACE_RE.sub(" ", cleaned).strip()


def normalize_term(value: str) -> str:
    """把单个词条归一化成 GitHub 常用术语。"""
    text = (value or "").strip()
    if not text:
        return ""
    lowered = text.lower()
    if lowered in TERM_ALIASES:
        return TERM_ALIASES[lowered]
    for alias, canonical in _ALIAS_ITEMS:
        if alias in text:
            text = text.replace(alias, f" {canonical} ")
    return _WHITESPACE_RE.sub(" ", text).strip()


def normalize_keywords(values: list[str], *, limit: int = 6) -> list[str]:
    """归一化关键词：只保留英文规范词，去泛词、去重、截断。"""
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = normalize_term(value)
        if not normalized:
            continue
        for token in re.split(r"[、,，/|]+", normalized):
            term = strip_non_english(token)
            key = term.lower()
            if not term or not has_english(term) or key in GENERIC_TERMS or key in seen:
                continue
            seen.add(key)
            result.append(term)
            if len(result) >= limit:
                return result
    return result


def normalize_search_query(text: str, *, max_chars: int = 120) -> str:
    """保留英文检索句：清掉残留中文与泛词；全中文输入返回空串。"""
    normalized = strip_non_english(normalize_term(text))
    if not normalized:
        return ""
    tokens = [
        token for token in normalized.split() if token.lower() not in GENERIC_TERMS
    ]
    return " ".join(tokens)[:max_chars].strip()
