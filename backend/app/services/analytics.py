"""Pipeline analytics for the dashboard: breakdowns, win rate, sales cycle and rule blockers."""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.domain import RuleSeverity, Stage
from app.models import Deal
from app.services.rules import evaluate_rules

PIPELINE_ORDER = [Stage.DISCOVERY, Stage.BUSINESS_CASE, Stage.POC, Stage.INFOSEC, Stage.CONTRACTS]
CLOSED = (Stage.CLOSED_WON, Stage.CLOSED_LOST)
NEXT_STAGE = {
    **{stage: PIPELINE_ORDER[i + 1] for i, stage in enumerate(PIPELINE_ORDER[:-1])},
    Stage.CONTRACTS: Stage.CLOSED_WON,
}


@dataclass
class Bucket:
    key: str
    count: int = 0
    value: Decimal = Decimal("0")


@dataclass
class OwnerBucket:
    owner: str
    deals: int = 0
    open_value: Decimal = Decimal("0")
    won_value: Decimal = Decimal("0")


@dataclass
class RuleBlocker:
    rule_id: int
    rule_name: str
    severity: RuleSeverity
    code: str
    params: dict[str, str]
    deals: int = 0
    value: Decimal = Decimal("0")


@dataclass
class Overview:
    won_count: int
    lost_count: int
    win_rate: float | None  # % of closed deals that were won
    avg_won_value: Decimal | None
    avg_cycle_days: float | None  # created -> won, for won deals
    overdue_count: int
    overdue_value: Decimal
    by_stage: list[Bucket] = field(default_factory=list)
    by_owner: list[OwnerBucket] = field(default_factory=list)
    by_segment: list[Bucket] = field(default_factory=list)  # open pipeline only
    rule_blockers: list[RuleBlocker] = field(default_factory=list)


def pipeline_overview(session: Session, today: date | None = None) -> Overview:
    today = today or datetime.now(UTC).date()
    deals = session.scalars(
        select(Deal).options(
            joinedload(Deal.company),
            joinedload(Deal.contract),
            selectinload(Deal.requirements),
            selectinload(Deal.stage_history),
        )
    ).unique().all()

    by_stage = {stage: Bucket(stage.value) for stage in [*PIPELINE_ORDER, *CLOSED]}
    by_owner: dict[str, OwnerBucket] = {}
    by_segment: dict[str, Bucket] = {}
    blockers: dict[int, RuleBlocker] = {}
    won_values: list[Decimal] = []
    cycle_days: list[int] = []
    lost = 0
    overdue_count = 0
    overdue_value = Decimal("0")

    for deal in deals:
        stage_bucket = by_stage[deal.stage]
        stage_bucket.count += 1
        stage_bucket.value += deal.value

        owner = by_owner.setdefault(deal.owner or "—", OwnerBucket(deal.owner or "—"))
        owner.deals += 1

        if deal.stage == Stage.CLOSED_WON:
            owner.won_value += deal.value
            won_values.append(deal.value)
            if deal.stage_history:
                history = sorted(deal.stage_history, key=lambda h: _aware(h.changed_at))
                won_at = next(
                    (h.changed_at for h in reversed(history) if h.to_stage == Stage.CLOSED_WON), None
                )
                if won_at is not None:
                    cycle_days.append((_aware(won_at) - _aware(history[0].changed_at)).days)
            continue
        if deal.stage == Stage.CLOSED_LOST:
            lost += 1
            continue

        # Open deal from here on.
        owner.open_value += deal.value
        segment = deal.company.segment or "—"
        segment_bucket = by_segment.setdefault(segment, Bucket(segment))
        segment_bucket.count += 1
        segment_bucket.value += deal.value

        if deal.close_date and deal.close_date < today:
            overdue_count += 1
            overdue_value += deal.value

        # What would stop this deal from moving to its next stage right now?
        for violation in evaluate_rules(session, deal, NEXT_STAGE[deal.stage]):
            blocker = blockers.setdefault(
                violation.rule_id,
                RuleBlocker(
                    violation.rule_id, violation.rule_name, violation.severity, violation.code, violation.params
                ),
            )
            blocker.deals += 1
            blocker.value += deal.value

    closed = len(won_values) + lost
    return Overview(
        won_count=len(won_values),
        lost_count=lost,
        win_rate=round(len(won_values) / closed * 100, 1) if closed else None,
        avg_won_value=(sum(won_values) / len(won_values)).quantize(Decimal("0.01")) if won_values else None,
        avg_cycle_days=round(sum(cycle_days) / len(cycle_days), 1) if cycle_days else None,
        overdue_count=overdue_count,
        overdue_value=overdue_value,
        by_stage=list(by_stage.values()),
        by_owner=sorted(by_owner.values(), key=lambda o: o.open_value + o.won_value, reverse=True),
        by_segment=sorted(by_segment.values(), key=lambda b: b.value, reverse=True),
        rule_blockers=sorted(blockers.values(), key=lambda b: b.value, reverse=True),
    )


def _aware(value: datetime) -> datetime:
    # SQLite (tests) returns naive datetimes; they are stored in UTC.
    return value if value.tzinfo else value.replace(tzinfo=UTC)
