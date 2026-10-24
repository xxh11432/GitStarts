from __future__ import annotations

from typing import Any

from pydantic import Field

from app.schemas.health import CamelModel
from app.schemas.match import Requirement

SCHEMA_VERSION = "v1"

DIMENSIONS: list[dict[str, str]] = [
    {"key": "positioning", "label": "定位与适用场景"},
    {"key": "tech_stack", "label": "技术栈与依赖"},
    {"key": "deploy", "label": "部署与运维成本"},
    {"key": "features", "label": "与本需求的能力覆盖"},
    {"key": "license", "label": "许可证与商用限制"},
    {"key": "activity", "label": "活跃度与社区"},
    {"key": "extensibility", "label": "扩展性与二次开发"},
    {"key": "risks", "label": "主要风险与坑"},
]

DIMENSION_KEYS = [dimension["key"] for dimension in DIMENSIONS]

# 每个维度的检索式：用于在仓库 README / manifest 中找证据段落。
DIMENSION_QUERIES: dict[str, str] = {
    "positioning": "项目定位 适用场景 目标用户 what is this project for use cases",
    "tech_stack": "技术栈 依赖 框架 语言 数据库 requirements dependencies stack",
    "deploy": "部署 安装 运维 docker compose self-host install deployment",
    "features": "功能特性 能力 支持 features capabilities what it does",
    "license": "许可证 开源协议 商用 license apache mit gpl",
    "activity": "维护 活跃 版本 发布 roadmap changelog release",
    "extensibility": "扩展 插件 API 二次开发 自定义 plugin extension api",
    "risks": "限制 已知问题 风险 坑 limitations known issues breaking changes",
}


class CompareRequest(CamelModel):
    idea_id: int | None = None
    raw_text: str | None = Field(default=None, max_length=4000)
    structured: Requirement | None = None
    repo_keys: list[str] = Field(default_factory=list)
    force: bool = False


class CompareEvidence(CamelModel):
    section: str = "README"
    snippet: str
    source_url: str | None = None
    chunk_type: str = "readme"


class CompareCell(CamelModel):
    dimension_key: str
    repo_key: str
    value: str
    evidence: list[CompareEvidence] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class CompareVerdict(CamelModel):
    recommended: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)


class RepoAnalysis(CamelModel):
    summary: str = ""
    architecture: str = ""
    pros: list[str] = Field(default_factory=list)
    cons: list[str] = Field(default_factory=list)
    use_cases: list[str] = Field(default_factory=list)


class LlmCell(CamelModel):
    key: str
    value: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence_sections: list[str] = Field(default_factory=list, max_length=3)


class LlmRepoCells(CamelModel):
    cells: list[LlmCell] = Field(default_factory=list, max_length=8)


class LlmVerdict(CamelModel):
    recommended: list[str] = Field(default_factory=list, max_length=2)
    reasons: list[str] = Field(default_factory=list, max_length=5)
    caveats: list[str] = Field(default_factory=list, max_length=5)


class CompareResult(CamelModel):
    schema_version: str = SCHEMA_VERSION
    dimensions: list[dict[str, str]] = Field(default_factory=list)
    repos: list[dict[str, Any]] = Field(default_factory=list)
    cells: list[CompareCell] = Field(default_factory=list)
    verdict: CompareVerdict = Field(default_factory=CompareVerdict)
    generated_at: str = ""
    degraded: bool = False
