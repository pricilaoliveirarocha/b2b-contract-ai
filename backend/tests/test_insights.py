from decimal import Decimal

from app.domain import RuleType
from app.models import Rule
from app.seed import seed
from app.services.insights import MAX_INSIGHTS, build_insights


def by_kind(session) -> dict:
    return {i.kind: i for i in build_insights(session)}


def test_empty_database_has_no_insights(session):
    assert build_insights(session) == []


def test_bottleneck_is_the_rule_holding_back_the_most_value(session):
    seed(session)

    bottleneck = by_kind(session)["bottleneck"]

    # Three deals in Contracts wait for a signed DPA: 275k + 88k + 64k.
    assert bottleneck.severity == "warning"
    assert bottleneck.params["deals"] == "3"
    assert Decimal(bottleneck.params["value"]) == Decimal("427000")
    assert float(bottleneck.params["avg_days"]) >= 0


def test_overdue_deals_are_summarised(session):
    seed(session)

    overdue = by_kind(session)["overdue"]

    assert overdue.params["count"] == "3"
    assert overdue.params["worst_days"] == "9"
    assert overdue.params["worst_company"] == "Construtora Alicerce"


def test_discount_limit_that_only_applies_at_closing(session):
    seed(session)

    gap = by_kind(session)["discount_gap"]

    # Agro Vale Verde (18%) is above the 15% limit, which is only checked when closing.
    assert gap.severity == "opportunity"
    assert gap.params["limit"] == "15"
    assert gap.params["deals"] == "1"
    assert gap.params["max_discount"] == "18"


def test_approval_threshold_that_only_applies_at_closing(session):
    seed(session)

    gap = by_kind(session)["approval_gap"]

    # Banco Ipe (390k, Infosec) and TeleConecta (275k, Contracts) are above 250k without approval.
    assert gap.params["threshold"] == "250000"
    assert gap.params["requirement"] == "board_approval"
    assert gap.params["deals"] == "2"
    assert Decimal(gap.params["value"]) == Decimal("665000")


def test_lost_deals_concentrated_in_one_stage(session):
    seed(session)

    lost = by_kind(session)["lost_concentration"]

    assert lost.params["stage"] == "business_case"
    assert (lost.params["count"], lost.params["total"]) == ("2", "2")


def test_stages_without_any_active_rule(session):
    seed(session)

    uncovered = by_kind(session)["uncovered_stages"]

    assert uncovered.params["stages"] == "business_case,poc,infosec"


def test_inactive_rules_are_reported(session):
    seed(session)
    rule = session.query(Rule).filter(Rule.rule_type == RuleType.MAX_DISCOUNT).one()
    rule.is_active = False
    session.commit()

    insights = by_kind(session)

    assert insights["inactive_rules"].params["rule_name"] == rule.name
    assert "discount_gap" not in insights  # a switched-off rule is not "a gap"


def test_a_rule_that_already_applies_earlier_is_not_a_gap(session):
    seed(session)
    rule = session.query(Rule).filter(Rule.rule_type == RuleType.MAX_DISCOUNT).one()
    rule.target_stage = "contracts"
    session.commit()

    assert "discount_gap" not in by_kind(session)


def test_most_urgent_first_and_capped(session):
    seed(session)

    insights = build_insights(session)

    ranks = {"warning": 0, "opportunity": 1, "info": 2}
    assert [ranks[i.severity] for i in insights] == sorted(ranks[i.severity] for i in insights)
    assert len(insights) <= MAX_INSIGHTS


def test_insights_endpoint(client, session):
    seed(session)

    body = client.get("/api/stats/insights").json()

    assert body["insights"][0]["severity"] == "warning"
    assert {"kind", "severity", "params"} == set(body["insights"][0])
    assert all(isinstance(v, str) for i in body["insights"] for v in i["params"].values())


def test_numbers_never_use_scientific_notation():
    from app.services.numbers import plain

    assert plain(Decimal("250000")) == "250000"
    assert plain(Decimal("20.00")) == "20"
    assert plain(Decimal("12.50")) == "12.5"
    assert plain(Decimal("0")) == "0"


def _add_rule(session, **fields):
    session.add(Rule(**fields))
    session.commit()


def test_gap_closes_once_a_rule_covers_an_earlier_stage(session):
    seed(session)
    assert "discount_gap" in by_kind(session) and "approval_gap" in by_kind(session)

    # What "Create this rule" produces: the same limits, now checked when entering Contracts.
    _add_rule(
        session,
        name="Discount check", rule_type=RuleType.MAX_DISCOUNT, target_stage="contracts",
        severity="warn", params={"max_percent": 15}, is_active=True,
    )
    _add_rule(
        session,
        name="Approval check", rule_type=RuleType.APPROVAL_ABOVE_VALUE, target_stage="contracts",
        severity="block", params={"min_value": 250000, "requirement_kind": "board_approval"}, is_active=True,
    )

    insights = by_kind(session)
    assert "discount_gap" not in insights
    assert "approval_gap" not in insights


def test_a_looser_early_rule_does_not_close_the_gap(session):
    seed(session)
    _add_rule(
        session,
        name="Loose discount check", rule_type=RuleType.MAX_DISCOUNT, target_stage="contracts",
        severity="warn", params={"max_percent": 30}, is_active=True,
    )

    # 30% at Contracts does not cover the stricter 15% that is only checked at closing.
    assert "discount_gap" in by_kind(session)
