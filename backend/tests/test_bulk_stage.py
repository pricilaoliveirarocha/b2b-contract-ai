import pytest
from sqlalchemy import func, select

from app.domain import Stage
from app.models import Company, Deal, StageHistory
from app.seed import seed


def deal_id(session, company: str) -> int:
    return session.scalar(select(Deal.id).join(Company).where(Company.name == company))


def bulk(client, ids, stage):
    return client.post("/api/deals/bulk-stage", json={"deal_ids": ids, "stage": stage})


def history_count(session, deal) -> int:
    return session.scalar(select(func.count(StageHistory.id)).where(StageHistory.deal_id == deal))


def test_moves_several_deals_and_records_each_in_the_history(client, session):
    seed(session)
    ids = [deal_id(session, "Rota Sul Transportes"), deal_id(session, "Clínica Horizonte Saúde")]
    before = [history_count(session, i) for i in ids]

    response = bulk(client, ids, "business_case")

    body = response.json()
    assert response.status_code == 200
    assert (body["moved"], body["blocked"], body["unchanged"], body["not_found"]) == (2, 0, 0, 0)
    assert {d["id"]: d["stage"] for d in body["deals"]} == {i: "business_case" for i in ids}
    session.expire_all()
    assert all(session.get(Deal, i).stage == Stage.BUSINESS_CASE for i in ids)
    assert [history_count(session, i) for i in ids] == [b + 1 for b in before]


def test_a_blocked_deal_does_not_stop_the_others(client, session):
    seed(session)
    allowed = deal_id(session, "Rede Farma Vital")  # Infosec, questionnaire already answered
    blocked = deal_id(session, "Banco Ipê Digital")  # Infosec, security questionnaire still pending
    history_before = history_count(session, blocked)

    body = bulk(client, [allowed, blocked], "contracts").json()

    by_id = {r["deal_id"]: r for r in body["results"]}
    assert by_id[allowed]["status"] == "moved"
    assert by_id[blocked]["status"] == "blocked"
    assert by_id[blocked]["violations"][0]["code"] == "requirement_not_done"
    assert by_id[blocked]["violations"][0]["params"]["requirement"] == "security_questionnaire"
    assert [d["id"] for d in body["deals"]] == [allowed]  # only what moved is returned
    session.expire_all()
    assert session.get(Deal, blocked).stage == Stage.INFOSEC  # untouched
    assert history_count(session, blocked) == history_before


def test_warnings_are_reported_per_deal(client, session):
    seed(session)
    deal = session.get(Deal, deal_id(session, "Agro Vale Verde"))  # 18% discount: above the 15% warning
    next(r for r in deal.requirements if r.kind == "dpa").is_done = True
    session.commit()

    result = bulk(client, [deal.id], "closed_won").json()["results"][0]

    assert result["status"] == "moved"
    assert [w["code"] for w in result["warnings"]] == ["discount_above_limit"]


def test_deals_already_in_the_stage_and_unknown_ids_are_reported(client, session):
    seed(session)
    already = deal_id(session, "Rota Sul Transportes")  # Discovery

    body = bulk(client, [already, 999999], "discovery").json()

    assert (body["moved"], body["unchanged"], body["not_found"]) == (0, 1, 1)
    assert body["deals"] == []


def test_repeated_ids_are_processed_once(client, session):
    seed(session)
    one = deal_id(session, "Rota Sul Transportes")
    before = history_count(session, one)

    body = bulk(client, [one, one, one], "poc").json()

    assert body["moved"] == 1 and len(body["results"]) == 1
    assert history_count(session, one) == before + 1


@pytest.mark.parametrize(
    "payload",
    [
        {"deal_ids": [], "stage": "poc"},  # nothing selected
        {"deal_ids": list(range(1, 202)), "stage": "poc"},  # more than 200
        {"deal_ids": [1], "stage": "nowhere"},  # unknown stage
        {"deal_ids": ["a"], "stage": "poc"},  # not numbers
        {"deal_ids": [1], "stage": "poc", "owner": "x"},  # unknown field
    ],
)
def test_invalid_requests_are_rejected(client, session, payload):
    seed(session)
    before = session.scalar(select(func.count(StageHistory.id)))

    assert client.post("/api/deals/bulk-stage", json=payload).status_code == 422
    assert session.scalar(select(func.count(StageHistory.id))) == before


def test_the_rules_apply_exactly_as_in_a_single_move(client, session):
    """Bulk and single moves share one code path: a deal blocked one way is blocked the other way."""
    seed(session)
    blocked = deal_id(session, "Banco Ipê Digital")

    single = client.patch(f"/api/deals/{blocked}/stage", json={"stage": "contracts"})
    in_bulk = bulk(client, [blocked], "contracts").json()["results"][0]

    assert single.status_code == 409
    assert in_bulk["status"] == "blocked"
    assert single.json()["detail"]["violations"][0]["rule_id"] == in_bulk["violations"][0]["rule_id"]
