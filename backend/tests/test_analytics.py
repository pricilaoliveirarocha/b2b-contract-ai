from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.domain import Stage
from app.models import Deal
from app.seed import seed
from app.services.analytics import pipeline_overview


def test_stage_buckets_add_up_to_all_deals(session):
    seed(session)
    deals = session.scalars(select(Deal)).all()

    overview = pipeline_overview(session)

    assert sum(b.count for b in overview.by_stage) == len(deals)
    assert sum(b.value for b in overview.by_stage) == sum(d.value for d in deals)
    assert [b.key for b in overview.by_stage][:2] == ["discovery", "business_case"]


def test_win_rate_and_average(session):
    seed(session)
    overview = pipeline_overview(session)

    assert (overview.won_count, overview.lost_count) == (2, 2)
    assert overview.win_rate == 50.0
    assert overview.avg_won_value == Decimal("259000.00")  # (420k + 98k) / 2
    assert overview.avg_cycle_days and overview.avg_cycle_days > 0


def test_segments_only_count_open_deals(session):
    seed(session)
    open_value = sum(
        d.value for d in session.scalars(select(Deal)) if d.stage not in (Stage.CLOSED_WON, Stage.CLOSED_LOST)
    )

    overview = pipeline_overview(session)

    assert sum(b.value for b in overview.by_segment) == open_value


def test_rule_blockers_reflect_pending_requirements(session):
    seed(session)
    overview = pipeline_overview(session)

    codes = {(b.code, b.params.get("requirement")) for b in overview.rule_blockers}
    # Banco Ipê (Infosec) can't go to Contracts: questionnaire pending.
    assert ("requirement_not_done", "security_questionnaire") in codes
    # Deals in Contracts can't close without a signed DPA.
    assert ("requirement_not_done", "dpa") in codes


def test_overdue_uses_today(session):
    seed(session)
    far_future = date(2100, 1, 1)

    overview = pipeline_overview(session, today=far_future)

    assert overview.overdue_count == sum(b.count for b in overview.by_segment)


def test_overview_endpoint(client, session):
    seed(session)
    body = client.get("/api/stats/overview").json()

    assert set(body) >= {"win_rate", "by_stage", "by_owner", "by_segment", "rule_blockers"}
    assert isinstance(body["by_stage"][0]["value"], str)
