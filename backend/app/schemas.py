from datetime import date, datetime
from decimal import Decimal

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

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


class OverviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    won_count: int
    lost_count: int
    win_rate: float | None
    avg_won_value: Decimal | None
    avg_cycle_days: float | None
    overdue_count: int
    overdue_value: Decimal
    by_stage: list[BucketOut]
    by_owner: list[OwnerBucketOut]
    by_segment: list[BucketOut]
    rule_blockers: list[RuleBlockerOut]


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


class RuleUpdateIn(BaseModel):
    """Editable parts of a rule. Which threshold applies depends on the rule type."""

    model_config = ConfigDict(extra="forbid")

    is_active: bool | None = None
    max_percent: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    min_value: Decimal | None = Field(default=None, ge=0, le=Decimal("1000000000"), decimal_places=2)
