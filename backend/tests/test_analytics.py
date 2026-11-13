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


def test_overdue_deals_are_listed_most_late_first(session):
    seed(session)

    overview = pipeline_overview(session)

    assert overview.overdue_count == len(overview.overdue_deals) == 3
    days = [d.days_overdue for d in overview.overdue_deals]
    assert days == sorted(days, reverse=True)
    assert all(d > 0 for d in days)
    assert overview.overdue_value == sum(d.value for d in overview.overdue_deals)
    assert all(d.stage not in (Stage.CLOSED_WON, Stage.CLOSED_LOST) for d in overview.overdue_deals)


def test_lost_deals_carry_value_stage_and_reason(session):
    seed(session)

    overview = pipeline_overview(session)

    assert overview.lost_count == len(overview.lost_deals) == 2
    assert overview.lost_value == Decimal("177000")  # 35k + 142k
    assert all(d.lost_from_stage == Stage.BUSINESS_CASE for d in overview.lost_deals)
    assert all(d.notes for d in overview.lost_deals)
    dates = [d.lost_at for d in overview.lost_deals]
    assert dates == sorted(dates, reverse=True)  # most recent first


def test_overview_endpoint_includes_risk_lists(client, session):
    seed(session)

    body = client.get("/api/stats/overview").json()

    assert body["lost_value"] == "177000.00"
    assert {"deal_id", "title", "company", "days_overdue", "close_date"} <= set(body["overdue_deals"][0])
    assert {"deal_id", "value", "lost_from_stage", "notes"} <= set(body["lost_deals"][0])
