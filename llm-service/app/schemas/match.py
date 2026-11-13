from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.health import CamelModel

ConditionValue = str | int | float | bool | list[str]


class Condition(CamelModel):
    key: str = Field(min_length=1, max_length=40)
    value: ConditionValue
    note: str | None = Field(default=None, max_length=200)


class Requirement(CamelModel):
    """模型/用户共同维护的结构化需求。

    must 是硬条件，should 是加权偏好，exclude 是明确排除项；
    模型不得把用户没说的内容写进这里，信息不足时宁可留空。
    """

    goal: str = Field(default="", max_length=500)
    domain: str | None = Field(default=None, max_length=100)
    audience: str | None = Field(default=None, max_length=100)
    # 一句检索式：只保留产品名、技术名与英文关键词，避免把整段原文塞进 query。
    search_query: str = Field(default="", max_length=80)
    must: list[Condition] = Field(default_factory=list, max_length=10)
    should: list[Condition] = Field(default_factory=list, max_length=10)
    exclude: list[str] = Field(default_factory=list, max_length=10)
    keywords: list[str] = Field(default_factory=list, max_length=6)
    degraded: bool = False
    notes: list[str] = Field(default_factory=list, max_length=10)


class LlmRequirement(CamelModel):
    """传给 with_structured_output 的 schema，不包含本地诊断字段。"""

    goal: str = Field(default="", max_length=500)
    domain: str | None = Field(default=None, max_length=100)
    audience: str | None = Field(default=None, max_length=100)
    search_query: str = Field(default="", max_length=80)
    must: list[Condition] = Field(default_factory=list, max_length=10)
    should: list[Condition] = Field(default_factory=list, max_length=10)
    exclude: list[str] = Field(default_factory=list, max_length=10)
    keywords: list[str] = Field(default_factory=list, max_length=6)


class MatchRequest(CamelModel):
    idea_id: int | None = None
    raw_text: str | None = Field(default=None, max_length=4000)
    structured: Requirement | None = None
    limit: int | None = Field(default=None, ge=1, le=10)


class ConditionCheck(CamelModel):
    key: str
    value: ConditionValue
    status: Literal["hit", "miss", "unknown"]


class FitBreakdown(CamelModel):
    semantic: float
    coverage: float
    maintenance: float


class Evidence(CamelModel):
    section: str
    snippet: str
    source_url: str | None = None


class Candidate(CamelModel):
    repo: dict[str, Any]
    fit: float
    breakdown: FitBreakdown
    reasons: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    conditions: list[ConditionCheck] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)


class CandidateList(CamelModel):
    items: list[Candidate]


class ParsedPayload(CamelModel):
    requirement: Requirement
    idea_id: int | None = None
