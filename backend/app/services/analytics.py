"""Pipeline analytics for the dashboard: breakdowns, win rate, sales cycle, risks and rule blockers."""

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
LIST_LIMIT = 10  # rows shown in the overdue / lost lists


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
    avg_days_stuck: float = 0.0  # average days the affected deals have been in their current stage


@dataclass
class OverdueDeal:
    """An open deal whose expected close date has passed."""

    deal_id: int
    title: str
    company: str
    owner: str | None
    stage: Stage
    value: Decimal
    close_date: date
    days_overdue: int


@dataclass
class LostDeal:
    deal_id: int
    title: str
    company: str
    owner: str | None
    value: Decimal
    lost_at: datetime | None
    lost_from_stage: Stage | None  # the stage the deal was in when it was lost
    notes: str | None  # the sales rep's account of why it was lost


@dataclass
class Overview:
    won_count: int
    lost_count: int
    lost_value: Decimal
    win_rate: float | None  # % of closed deals that were won
    avg_won_value: Decimal | None
    avg_cycle_days: float | None  # created -> won, for won deals
    overdue_count: int
    overdue_value: Decimal
    by_stage: list[Bucket] = field(default_factory=list)
    by_owner: list[OwnerBucket] = field(default_factory=list)
    by_segment: list[Bucket] = field(default_factory=list)  # open pipeline only
    rule_blockers: list[RuleBlocker] = field(default_factory=list)
    overdue_deals: list[OverdueDeal] = field(default_factory=list)  # most late first
    lost_deals: list[LostDeal] = field(default_factory=list)  # most recent first


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
    stuck_days: dict[int, int] = {}  # rule id -> total days in stage, summed over the affected deals
    overdue_deals: list[OverdueDeal] = []
    lost_deals: list[LostDeal] = []
    won_values: list[Decimal] = []
    cycle_days: list[int] = []
    lost_value = Decimal("0")
    overdue_value = Decimal("0")

    for deal in deals:
        stage_bucket = by_stage[deal.stage]
        stage_bucket.count += 1
        stage_bucket.value += deal.value

        owner = by_owner.setdefault(deal.owner or "—", OwnerBucket(deal.owner or "—"))
        owner.deals += 1
        history = sorted(deal.stage_history, key=lambda h: _aware(h.changed_at))

        if deal.stage == Stage.CLOSED_WON:
            owner.won_value += deal.value
            won_values.append(deal.value)
            won_at = next((h.changed_at for h in reversed(history) if h.to_stage == Stage.CLOSED_WON), None)
            if won_at is not None:
                cycle_days.append((_aware(won_at) - _aware(history[0].changed_at)).days)
            continue

        if deal.stage == Stage.CLOSED_LOST:
            lost_value += deal.value
            lost_entry = next((h for h in reversed(history) if h.to_stage == Stage.CLOSED_LOST), None)
            lost_deals.append(
                LostDeal(
                    deal_id=deal.id,
                    title=deal.title,
                    company=deal.company.name,
                    owner=deal.owner,
                    value=deal.value,
                    lost_at=_aware(lost_entry.changed_at) if lost_entry else None,
                    lost_from_stage=lost_entry.from_stage if lost_entry else None,
                    notes=deal.notes,
                )
            )
            continue

        # Open deal from here on.
        owner.open_value += deal.value
        segment = deal.company.segment or "—"
        segment_bucket = by_segment.setdefault(segment, Bucket(segment))
        segment_bucket.count += 1
        segment_bucket.value += deal.value

        if deal.close_date and deal.close_date < today:
            overdue_value += deal.value
            overdue_deals.append(
                OverdueDeal(
                    deal_id=deal.id,
                    title=deal.title,
                    company=deal.company.name,
                    owner=deal.owner,
                    stage=deal.stage,
                    value=deal.value,
                    close_date=deal.close_date,
                    days_overdue=(today - deal.close_date).days,
                )
            )

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
            last_move = _aware(history[-1].changed_at).date() if history else today
            stuck_days[violation.rule_id] = stuck_days.get(violation.rule_id, 0) + (today - last_move).days

    for blocker in blockers.values():
        blocker.avg_days_stuck = round(stuck_days.get(blocker.rule_id, 0) / blocker.deals, 1)

    closed = len(won_values) + len(lost_deals)
    epoch = datetime.min.replace(tzinfo=UTC)
    return Overview(
        won_count=len(won_values),
        lost_count=len(lost_deals),
        lost_value=lost_value,
        win_rate=round(len(won_values) / closed * 100, 1) if closed else None,
        avg_won_value=(sum(won_values) / len(won_values)).quantize(Decimal("0.01")) if won_values else None,
        avg_cycle_days=round(sum(cycle_days) / len(cycle_days), 1) if cycle_days else None,
        overdue_count=len(overdue_deals),
        overdue_value=overdue_value,
        by_stage=list(by_stage.values()),
        by_owner=sorted(by_owner.values(), key=lambda o: o.open_value + o.won_value, reverse=True),
        by_segment=sorted(by_segment.values(), key=lambda b: b.value, reverse=True),
        rule_blockers=sorted(blockers.values(), key=lambda b: b.value, reverse=True),
        overdue_deals=sorted(overdue_deals, key=lambda d: (-d.days_overdue, -d.value))[:LIST_LIMIT],
        lost_deals=sorted(lost_deals, key=lambda d: d.lost_at or epoch, reverse=True)[:LIST_LIMIT],
    )


def _aware(value: datetime) -> datetime:
    # SQLite (tests) returns naive datetimes; they are stored in UTC.
    return value if value.tzinfo else value.replace(tzinfo=UTC)
