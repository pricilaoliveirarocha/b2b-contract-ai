from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.domain import STAGE_PROBABILITY, Stage
from app.models import Company, Deal, StageHistory
from app.seed import seed
from app.services.stats import pipeline_trend

CLOSED = (Stage.CLOSED_WON, Stage.CLOSED_LOST)


def test_last_point_matches_current_pipeline(session):
    seed(session)
    deals = session.scalars(select(Deal)).all()

    last = pipeline_trend(session, weeks=8)[-1]

    open_deals = [d for d in deals if d.stage not in CLOSED]
    assert last.open_deals == len(open_deals)
    assert last.open_value == sum(d.value for d in open_deals)
    assert last.won_value == sum(d.value for d in deals if d.stage == Stage.CLOSED_WON)
    expected_weighted = sum(d.value * STAGE_PROBABILITY[d.stage] / 100 for d in open_deals)
    assert last.weighted_value == Decimal(expected_weighted).quantize(Decimal("0.01"))


def test_returns_one_point_per_week_oldest_first(session):
    seed(session)
    points = pipeline_trend(session, weeks=6)

    assert len(points) == 6
    assert [p.date for p in points] == sorted(p.date for p in points)


def test_stage_is_taken_from_history_at_each_date(session):
    now = datetime(2026, 6, 1, tzinfo=UTC)
    deal = Deal(company=Company(name="Linha do tempo"), title="X", stage=Stage.CLOSED_WON, value=Decimal("100"))
    deal.stage_history = [
        StageHistory(from_stage=None, to_stage=Stage.DISCOVERY, changed_at=now - timedelta(weeks=3)),
        StageHistory(from_stage=Stage.DISCOVERY, to_stage=Stage.CLOSED_WON, changed_at=now - timedelta(weeks=1)),
    ]
    session.add(deal)
    session.commit()

    points = pipeline_trend(session, weeks=4, now=now)

    assert [(p.open_deals, p.won_value) for p in points] == [
        (1, Decimal("0")),  # 3 weeks ago: Discovery
        (1, Decimal("0")),  # 2 weeks ago: still Discovery
        (0, Decimal("100")),  # 1 week ago: won
        (0, Decimal("100")),  # now
    ]


def test_deals_not_created_yet_are_ignored(session):
    now = datetime(2026, 6, 1, tzinfo=UTC)
    deal = Deal(company=Company(name="Novo"), title="X", stage=Stage.DISCOVERY, value=Decimal("50"))
    deal.stage_history = [StageHistory(from_stage=None, to_stage=Stage.DISCOVERY, changed_at=now)]
    session.add(deal)
    session.commit()

    points = pipeline_trend(session, weeks=2, now=now)

    assert [p.open_deals for p in points] == [0, 1]


def test_trend_endpoint(client, session):
    seed(session)

    response = client.get("/api/stats/trend", params={"weeks": 4})

    assert response.status_code == 200
    points = response.json()["points"]
    assert len(points) == 4
    assert set(points[0]) == {"date", "open_value", "weighted_value", "won_value", "open_deals"}


def test_trend_endpoint_validates_weeks(client):
    assert client.get("/api/stats/trend", params={"weeks": 1}).status_code == 422
    assert client.get("/api/stats/trend", params={"weeks": 27}).status_code == 422
