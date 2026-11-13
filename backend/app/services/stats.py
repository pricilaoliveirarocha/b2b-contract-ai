"""Pipeline trend: weekly snapshots rebuilt from the stage history."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.domain import STAGE_PROBABILITY, Stage
from app.models import Deal

CLOSED_STAGES = (Stage.CLOSED_WON, Stage.CLOSED_LOST)


@dataclass(frozen=True)
class TrendPoint:
    date: datetime
    open_value: Decimal
    weighted_value: Decimal
    won_value: Decimal
    open_deals: int


def pipeline_trend(session: Session, weeks: int, now: datetime | None = None) -> list[TrendPoint]:
    """Return one snapshot per week, oldest first, ending at `now`.

    Each deal's stage at a given date is the last stage history entry up to that date.
    Deal values are today's values (value changes are not versioned yet).
    """
    now = now or datetime.now(UTC)
    deals = session.scalars(select(Deal).options(selectinload(Deal.stage_history))).all()
    histories = [
        (deal.value, sorted((_aware(h.changed_at), h.to_stage) for h in deal.stage_history))
        for deal in deals
    ]

    points = []
    for weeks_ago in range(weeks - 1, -1, -1):
        at = now - timedelta(weeks=weeks_ago)
        open_value = weighted = won = Decimal("0")
        open_deals = 0
        for value, history in histories:
            stage = _stage_at(history, at)
            if stage is None:
                continue  # the deal did not exist yet
            if stage == Stage.CLOSED_WON:
                won += value
            elif stage not in CLOSED_STAGES:
                open_value += value
                weighted += value * STAGE_PROBABILITY[stage] / 100
                open_deals += 1
        points.append(TrendPoint(at, open_value, weighted.quantize(Decimal("0.01")), won, open_deals))
    return points


def _stage_at(history: list[tuple[datetime, Stage]], at: datetime) -> Stage | None:
    stage = None
    for changed_at, to_stage in history:
        if changed_at > at:
            break
        stage = to_stage
    return stage


def _aware(value: datetime) -> datetime:
    # SQLite (tests) returns naive datetimes; they are stored in UTC.
    return value if value.tzinfo else value.replace(tzinfo=UTC)
