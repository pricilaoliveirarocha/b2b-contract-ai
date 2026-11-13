from datetime import date, datetime
from decimal import Decimal

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain import ContractStatus, Priority, RuleSeverity, RuleType, Stage


class CompanySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class DealOut(BaseModel):
    """Deal as shown on the kanban board.

    `value` is serialized as a string (e.g. "120000.00") to keep monetary precision.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    company: CompanySummary
    area: str | None
    stage: Stage
    value: Decimal
    currency: str
    priority: Priority
    close_date: date | None
    owner: str | None
    last_touched_at: datetime | None


class ContractOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: ContractStatus
    total_value: Decimal
    duration_months: int
    start_date: date | None
    payment_terms: str | None
    discount_percent: Decimal


class RequirementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kind: str
    label: str
    is_done: bool
    done_at: datetime | None


class StageHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    from_stage: Stage | None
    to_stage: Stage
    changed_at: datetime


class DealDetailOut(DealOut):
    """Everything about one deal, for the detail panel (not sent in the board listing)."""

    notes: str | None
    contract: ContractOut | None
    requirements: list[RequirementOut]
    stage_history: list[StageHistoryOut]


class StageChangeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stage: Stage


class RuleViolationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rule_id: int
    rule_name: str
    severity: RuleSeverity
    code: str  # stable identifier clients can translate, e.g. "requirement_missing"
    message: str  # English fallback text
    params: dict[str, str]


class StageChangeOut(BaseModel):
    deal: DealOut
    warnings: list[RuleViolationOut]


class TrendPointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: datetime
    open_value: Decimal
    weighted_value: Decimal
    won_value: Decimal
    open_deals: int


class TrendOut(BaseModel):
    points: list[TrendPointOut]


class BucketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    count: int
    value: Decimal


class OwnerBucketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    owner: str
    deals: int
    open_value: Decimal
    won_value: Decimal


class RuleBlockerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rule_id: int
    rule_name: str
    severity: RuleSeverity
    code: str
    params: dict[str, str]
    deals: int
    value: Decimal
    avg_days_stuck: float


class OverdueDealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    deal_id: int
    title: str
    company: str
    owner: str | None
    stage: Stage
    value: Decimal
    close_date: date
    days_overdue: int


class LostDealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    deal_id: int
    title: str
    company: str
    owner: str | None
    value: Decimal
    lost_at: datetime | None
    lost_from_stage: Stage | None
    notes: str | None


class OverviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    won_count: int
    lost_count: int
    lost_value: Decimal
    win_rate: float | None
    avg_won_value: Decimal | None
    avg_cycle_days: float | None
    overdue_count: int
    overdue_value: Decimal
    by_stage: list[BucketOut]
    by_owner: list[OwnerBucketOut]
    by_segment: list[BucketOut]
    rule_blockers: list[RuleBlockerOut]
    overdue_deals: list[OverdueDealOut]
    lost_deals: list[LostDealOut]


class RuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    rule_type: RuleType
    target_stage: Stage
    severity: RuleSeverity
    params: dict[str, Any]
    is_active: bool


_KIND_PATTERN = r"^[a-z][a-z0-9_]{1,63}$"  # checklist item identifier, e.g. "dpa"
_MAX_VALUE = Decimal("1000000000")


class RuleUpdateIn(BaseModel):
    """Editable parts of a rule. The rule type cannot change (delete and recreate instead).

    Which parameter applies depends on the rule type; the router rejects the wrong ones.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    target_stage: Stage | None = None
    severity: RuleSeverity | None = None
    is_active: bool | None = None
    requirement_kind: str | None = Field(default=None, pattern=_KIND_PATTERN)
    max_percent: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    min_value: Decimal | None = Field(default=None, ge=0, le=_MAX_VALUE, decimal_places=2)


class RuleCreateIn(BaseModel):
    """A new rule. The parameters required depend on `rule_type` (checked below)."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    rule_type: RuleType
    target_stage: Stage
    severity: RuleSeverity
    is_active: bool = True
    requirement_kind: str | None = Field(default=None, pattern=_KIND_PATTERN)
    max_percent: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    min_value: Decimal | None = Field(default=None, ge=0, le=_MAX_VALUE, decimal_places=2)

    @model_validator(mode="after")
    def _params_match_type(self) -> "RuleCreateIn":
        required: dict[RuleType, tuple[str, ...]] = {
            RuleType.REQUIREMENT_DONE: ("requirement_kind",),
            RuleType.MAX_DISCOUNT: ("max_percent",),
            RuleType.APPROVAL_ABOVE_VALUE: ("min_value", "requirement_kind"),
        }
        allowed = {"requirement_kind", "max_percent", "min_value"}
        needed = required[self.rule_type]
        for field_name in needed:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} is required for {self.rule_type.value} rules")
        for field_name in allowed - set(needed):
            if getattr(self, field_name) is not None:
                raise ValueError(f"{field_name} does not apply to {self.rule_type.value} rules")
        return self


class RuleDraftIn(BaseModel):
    """Plain-language description of a rule, to be turned into a draft by the AI."""

    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=8, max_length=500)


class RuleDraftOut(BaseModel):
    """A proposed rule. Nothing is saved: an administrator reviews it and creates it as usual."""

    rule: RuleCreateIn
    explanation: str


class InsightOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kind: str  # e.g. "bottleneck"; the interface writes the sentence from kind + params
    severity: str  # "warning" | "opportunity" | "info"
    params: dict[str, str]


class InsightsOut(BaseModel):
    insights: list[InsightOut]
