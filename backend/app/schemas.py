from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.domain import Priority, RuleSeverity, Stage


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
