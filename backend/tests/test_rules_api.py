import pytest

from app import auth
from app.config import Settings
from app.domain import RuleType
from app.models import Company, Deal, Rule
from app.seed import DEMO_RULES, seed

TOKEN = "test-admin-token"


@pytest.fixture
def admin(monkeypatch) -> dict[str, str]:
    """Headers of an administrator: the server is configured with TOKEN."""
    monkeypatch.setattr(auth, "get_settings", lambda: Settings(admin_token=TOKEN))
    return {"X-Admin-Token": TOKEN}


def _rule_id(session, rule_type: RuleType) -> int:
    return next(r.id for r in session.query(Rule).all() if r.rule_type == rule_type)


NEW_DISCOUNT_RULE = {
    "name": "Desconto máximo para renovações",
    "description": "Renovações não devem passar de 10%.",
    "rule_type": "max_discount",
    "target_stage": "closed_won",
    "severity": "warn",
    "max_percent": "10",
}


# --- reading is open ---------------------------------------------------------------------


def test_list_rules_needs_no_token(client, session):
    seed(session)
    body = client.get("/api/rules").json()
    assert len(body) == len(DEMO_RULES)
    assert {"id", "name", "rule_type", "params", "is_active"} <= set(body[0])


# --- access control ----------------------------------------------------------------------


def test_changes_are_refused_without_token(client, session, admin):
    seed(session)
    rule_id = _rule_id(session, RuleType.MAX_DISCOUNT)

    assert client.post("/api/rules", json=NEW_DISCOUNT_RULE).status_code == 401
    assert client.patch(f"/api/rules/{rule_id}", json={"is_active": False}).status_code == 401
    assert client.delete(f"/api/rules/{rule_id}").status_code == 401
    assert session.get(Rule, rule_id) is not None


def test_changes_are_refused_with_wrong_token(client, session, admin):
    seed(session)
    rule_id = _rule_id(session, RuleType.MAX_DISCOUNT)
    wrong = {"X-Admin-Token": "not-the-token"}

    assert client.delete(f"/api/rules/{rule_id}", headers=wrong).status_code == 401
    assert client.get("/api/admin/session", headers=wrong).status_code == 401


def test_admin_is_disabled_when_no_token_is_configured(client, session, monkeypatch):
    monkeypatch.setattr(auth, "get_settings", lambda: Settings(admin_token=""))
    seed(session)
    rule_id = _rule_id(session, RuleType.MAX_DISCOUNT)

    # Even sending an empty token must not unlock anything.
    for headers in ({}, {"X-Admin-Token": ""}):
        assert client.delete(f"/api/rules/{rule_id}", headers=headers).status_code == 403
    assert client.get("/api/admin/session").status_code == 403


def test_admin_session_accepts_valid_token(client, admin):
    response = client.get("/api/admin/session", headers=admin)
    assert response.status_code == 200
    assert response.json() == {"admin": True}


# --- create ------------------------------------------------------------------------------


def test_create_rule(client, session, admin):
    seed(session)

    response = client.post("/api/rules", json=NEW_DISCOUNT_RULE, headers=admin)

    assert response.status_code == 201
    body = response.json()
    assert body["params"] == {"max_percent": 10}
    assert body["is_active"] is True
    assert len(client.get("/api/rules").json()) == len(DEMO_RULES) + 1


def test_create_requirement_rule(client, session, admin):
    seed(session)
    payload = {
        "name": "Aprovação do jurídico",
        "rule_type": "requirement_done",
        "target_stage": "contracts",
        "severity": "block",
        "requirement_kind": "legal_review",
    }

    response = client.post("/api/rules", json=payload, headers=admin)

    assert response.status_code == 201
    assert response.json()["params"] == {"requirement_kind": "legal_review"}


def test_create_approval_rule_needs_value_and_requirement(client, session, admin):
    seed(session)
    base = {
        "name": "Aprovação acima de R$ 500 mil",
        "rule_type": "approval_above_value",
        "target_stage": "closed_won",
        "severity": "block",
    }
    assert client.post("/api/rules", json={**base, "min_value": "500000"}, headers=admin).status_code == 422
    ok = client.post(
        "/api/rules", json={**base, "min_value": "500000", "requirement_kind": "board_approval"}, headers=admin
    )
    assert ok.status_code == 201
    assert ok.json()["params"] == {"min_value": 500000, "requirement_kind": "board_approval"}


@pytest.mark.parametrize(
    "changes",
    [
        {"max_percent": None},  # missing the parameter of its own type
        {"max_percent": "150"},  # out of range
        {"max_percent": "-1"},
        {"min_value": "1000"},  # parameter of another rule type
        {"requirement_kind": "dpa"},  # parameter of another rule type
        {"name": "ab"},  # too short
        {"target_stage": "nowhere"},
        {"severity": "maybe"},
        {"rule_type": "do_anything"},
        {"is_admin": True},  # unknown field
    ],
)
def test_create_rejects_invalid_payloads(client, session, admin, changes):
    payload = {**NEW_DISCOUNT_RULE, **changes}
    if payload.get("max_percent") is None:
        payload.pop("max_percent")
    assert client.post("/api/rules", json=payload, headers=admin).status_code == 422
    assert len(client.get("/api/rules").json()) == 0


def test_requirement_kind_must_look_like_an_identifier(client, admin):
    payload = {
        "name": "Regra com item inválido",
        "rule_type": "requirement_done",
        "target_stage": "contracts",
        "severity": "block",
        "requirement_kind": "DROP TABLE rules;",
    }
    assert client.post("/api/rules", json=payload, headers=admin).status_code == 422


# --- update ------------------------------------------------------------------------------


def test_toggle_rule(client, session, admin):
    seed(session)
    rule_id = _rule_id(session, RuleType.REQUIREMENT_DONE)

    response = client.patch(f"/api/rules/{rule_id}", json={"is_active": False}, headers=admin)

    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_edit_name_description_stage_and_severity(client, session, admin):
    seed(session)
    rule_id = _rule_id(session, RuleType.MAX_DISCOUNT)

    response = client.patch(
        f"/api/rules/{rule_id}",
        json={"name": "  Desconto acima de 20%  ", "description": None, "severity": "block", "target_stage": "contracts"},
        headers=admin,
    )

    body = response.json()
    assert response.status_code == 200
    assert body["name"] == "Desconto acima de 20%"  # trimmed
    assert body["description"] is None
    assert (body["severity"], body["target_stage"]) == ("block", "contracts")


def test_update_discount_limit(client, session, admin):
    seed(session)
    rule_id = _rule_id(session, RuleType.MAX_DISCOUNT)

    response = client.patch(f"/api/rules/{rule_id}", json={"max_percent": "20"}, headers=admin)

    assert response.status_code == 200
    assert response.json()["params"]["max_percent"] == 20
    session.expire_all()
    assert session.get(Rule, rule_id).params["max_percent"] == 20


def test_update_rejects_parameters_of_another_type(client, session, admin):
    seed(session)
    rule_id = _rule_id(session, RuleType.MAX_DISCOUNT)
    url = f"/api/rules/{rule_id}"

    assert client.patch(url, json={"min_value": "1000"}, headers=admin).status_code == 422
    assert client.patch(url, json={"requirement_kind": "dpa"}, headers=admin).status_code == 422


def test_update_rejects_invalid_values(client, session, admin):
    seed(session)
    rule_id = _rule_id(session, RuleType.MAX_DISCOUNT)
    url = f"/api/rules/{rule_id}"

    assert client.patch(url, json={"max_percent": "150"}, headers=admin).status_code == 422
    assert client.patch(url, json={"max_percent": "-1"}, headers=admin).status_code == 422
    assert client.patch(url, json={"name": None}, headers=admin).status_code == 422
    assert client.patch(url, json={"rule_type": "requirement_done"}, headers=admin).status_code == 422  # immutable


def test_unknown_rule(client, admin):
    assert client.patch("/api/rules/9999", json={"is_active": False}, headers=admin).status_code == 404
    assert client.delete("/api/rules/9999", headers=admin).status_code == 404


# --- delete ------------------------------------------------------------------------------


def test_delete_rule(client, session, admin):
    seed(session)
    rule_id = _rule_id(session, RuleType.MAX_DISCOUNT)

    response = client.delete(f"/api/rules/{rule_id}", headers=admin)

    assert response.status_code == 204
    assert rule_id not in {r["id"] for r in client.get("/api/rules").json()}


def test_deleted_rule_no_longer_blocks_a_move(client, session, admin):
    """The whole point: removing a rule changes what the pipeline allows."""
    seed(session)
    deal = session.query(Deal).join(Company).filter(Company.name == "Banco Ipê Digital").one()
    assert client.patch(f"/api/deals/{deal.id}/stage", json={"stage": "contracts"}).status_code == 409

    rule = next(r for r in session.query(Rule).all() if r.params.get("requirement_kind") == "security_questionnaire")
    client.delete(f"/api/rules/{rule.id}", headers=admin)

    # Without that rule the move is allowed (no other rule targets Contracts).
    assert client.patch(f"/api/deals/{deal.id}/stage", json={"stage": "contracts"}).status_code == 200
