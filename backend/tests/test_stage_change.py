from decimal import Decimal

from sqlalchemy import func, select

from app.domain import Stage
from app.models import Company, Contract, ContractRequirement, Deal, Rule, StageHistory
from app.seed import DEMO_RULES, seed
from app.services.rules import evaluate_rules


def _deal_by_company(session, name: str) -> Deal:
    return session.scalar(select(Deal).join(Deal.company).where(Company.name == name))


def _history_count(session, deal_id: int) -> int:
    return session.scalar(select(func.count(StageHistory.id)).where(StageHistory.deal_id == deal_id))


def _complete(deal: Deal, kind: str) -> None:
    next(r for r in deal.requirements if r.kind == kind).is_done = True


def _seed_rules_only(session) -> None:
    for data in DEMO_RULES:
        session.add(Rule(**data))
    session.commit()


# --- rule evaluation -----------------------------------------------------------------


def test_no_rules_for_early_stages(session):
    seed(session)
    deal = _deal_by_company(session, "Rota Sul Transportes")
    assert evaluate_rules(session, deal, Stage.BUSINESS_CASE) == []


def test_missing_security_questionnaire_blocks_contracts(session):
    seed(session)
    deal = _deal_by_company(session, "Banco Ipê Digital")  # infosec, questionnaire pending

    violations = evaluate_rules(session, deal, Stage.CONTRACTS)

    assert [v.severity for v in violations] == ["block"]
    assert violations[0].code == "requirement_not_done"
    assert violations[0].params["requirement"] == "security_questionnaire"


def test_requirement_absent_from_checklist_counts_as_violation(session):
    seed(session)
    deal = _deal_by_company(session, "Energia Clara Renováveis")  # POC, no checklist yet

    violations = evaluate_rules(session, deal, Stage.CONTRACTS)

    assert len(violations) == 1
    assert violations[0].code == "requirement_missing"
    assert violations[0].params == {"requirement": "security_questionnaire"}
    assert "missing" in violations[0].message  # English fallback is still sent


def test_high_discount_only_warns(session):
    seed(session)
    deal = _deal_by_company(session, "Agro Vale Verde")  # R$ 88k, 18% discount
    _complete(deal, "dpa")

    violations = evaluate_rules(session, deal, Stage.CLOSED_WON)

    assert [v.severity for v in violations] == ["warn"]
    assert violations[0].code == "discount_above_limit"
    assert violations[0].params == {"discount": "18", "max": "15"}


def test_board_approval_required_only_above_threshold(session):
    seed(session)
    big = _deal_by_company(session, "TeleConecta Fibra")  # R$ 275k
    small = _deal_by_company(session, "Agro Vale Verde")  # R$ 88k
    _complete(big, "dpa")
    _complete(small, "dpa")

    big_names = [v.rule_name for v in evaluate_rules(session, big, Stage.CLOSED_WON)]
    small_names = [v.rule_name for v in evaluate_rules(session, small, Stage.CLOSED_WON)]

    assert any("Board approval" in name for name in big_names)
    assert not any("Board approval" in name for name in small_names)


def test_inactive_rules_are_ignored(session):
    seed(session)
    deal = _deal_by_company(session, "Banco Ipê Digital")
    for rule in session.scalars(select(Rule).where(Rule.target_stage == Stage.CONTRACTS)):
        rule.is_active = False

    assert evaluate_rules(session, deal, Stage.CONTRACTS) == []


# --- PATCH /api/deals/{id}/stage ------------------------------------------------------


def test_move_without_rules_succeeds_and_records_history(client, session):
    seed(session)
    deal = _deal_by_company(session, "Rota Sul Transportes")
    before = _history_count(session, deal.id)

    response = client.patch(f"/api/deals/{deal.id}/stage", json={"stage": "business_case"})

    assert response.status_code == 200
    body = response.json()
    assert body["deal"]["stage"] == "business_case"
    assert body["warnings"] == []
    assert _history_count(session, deal.id) == before + 1
    last = session.scalars(
        select(StageHistory).where(StageHistory.deal_id == deal.id).order_by(StageHistory.id.desc())
    ).first()
    assert (last.from_stage, last.to_stage) == (Stage.DISCOVERY, Stage.BUSINESS_CASE)


def test_blocking_rule_returns_409_and_changes_nothing(client, session):
    seed(session)
    deal = _deal_by_company(session, "Banco Ipê Digital")
    before = _history_count(session, deal.id)

    response = client.patch(f"/api/deals/{deal.id}/stage", json={"stage": "contracts"})

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["violations"][0]["severity"] == "block"
    assert detail["violations"][0]["code"] == "requirement_not_done"
    assert detail["violations"][0]["params"]["requirement"] == "security_questionnaire"
    session.expire_all()
    assert session.get(Deal, deal.id).stage == Stage.INFOSEC
    assert _history_count(session, deal.id) == before


def test_warning_rule_lets_move_through(client, session):
    seed(session)
    deal = _deal_by_company(session, "Agro Vale Verde")
    _complete(deal, "dpa")
    session.commit()

    response = client.patch(f"/api/deals/{deal.id}/stage", json={"stage": "closed_won"})

    assert response.status_code == 200
    body = response.json()
    assert body["deal"]["stage"] == "closed_won"
    assert [w["severity"] for w in body["warnings"]] == ["warn"]


def test_move_to_same_stage_is_rejected(client, session):
    seed(session)
    deal = _deal_by_company(session, "Rota Sul Transportes")
    response = client.patch(f"/api/deals/{deal.id}/stage", json={"stage": "discovery"})
    assert response.status_code == 400


def test_unknown_deal_returns_404(client, session):
    response = client.patch("/api/deals/999999/stage", json={"stage": "poc"})
    assert response.status_code == 404


def test_invalid_payload_is_rejected(client, session):
    seed(session)
    deal = _deal_by_company(session, "Rota Sul Transportes")
    url = f"/api/deals/{deal.id}/stage"

    assert client.patch(url, json={"stage": "not_a_stage"}).status_code == 422
    assert client.patch(url, json={}).status_code == 422
    # Extra fields (e.g. trying to set the value) are not accepted.
    assert client.patch(url, json={"stage": "poc", "value": "1"}).status_code == 422


def test_deal_without_contract_skips_discount_rule(session):
    deal = Deal(company=Company(name="Sem contrato"), title="X", stage=Stage.CONTRACTS, value=Decimal("1000"))
    deal.requirements.append(ContractRequirement(kind="dpa", label="DPA", is_done=True))
    session.add(deal)
    session.commit()
    _seed_rules_only(session)

    assert evaluate_rules(session, deal, Stage.CLOSED_WON) == []



def test_deal_with_contract_at_limit_has_no_discount_warning(session):
    _seed_rules_only(session)
    deal = Deal(company=Company(name="No limite"), title="X", stage=Stage.CONTRACTS, value=Decimal("1000"))
    deal.requirements.append(ContractRequirement(kind="dpa", label="DPA", is_done=True))
    deal.contract = Contract(total_value=Decimal("1000"), duration_months=12, discount_percent=Decimal("15"))
    session.add(deal)
    session.commit()

    assert evaluate_rules(session, deal, Stage.CLOSED_WON) == []
