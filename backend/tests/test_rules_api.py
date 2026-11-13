from app.domain import RuleType
from app.models import Rule
from app.seed import DEMO_RULES, seed


def _rule_id(session, rule_type: RuleType) -> int:
    return next(r.id for r in session.query(Rule).all() if r.rule_type == rule_type)


def test_list_rules(client, session):
    seed(session)
    body = client.get("/api/rules").json()
    assert len(body) == len(DEMO_RULES)
    assert {"id", "name", "rule_type", "params", "is_active"} <= set(body[0])


def test_toggle_rule(client, session):
    seed(session)
    rule_id = _rule_id(session, RuleType.REQUIREMENT_DONE)

    response = client.patch(f"/api/rules/{rule_id}", json={"is_active": False})

    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_update_discount_limit(client, session):
    seed(session)
    rule_id = _rule_id(session, RuleType.MAX_DISCOUNT)

    response = client.patch(f"/api/rules/{rule_id}", json={"max_percent": "20"})

    assert response.status_code == 200
    assert response.json()["params"]["max_percent"] == 20
    session.expire_all()
    assert session.get(Rule, rule_id).params["max_percent"] == 20


def test_threshold_must_match_rule_type(client, session):
    seed(session)
    rule_id = _rule_id(session, RuleType.MAX_DISCOUNT)
    assert client.patch(f"/api/rules/{rule_id}", json={"min_value": "1000"}).status_code == 422


def test_rejects_invalid_values(client, session):
    seed(session)
    rule_id = _rule_id(session, RuleType.MAX_DISCOUNT)
    url = f"/api/rules/{rule_id}"
    assert client.patch(url, json={"max_percent": "150"}).status_code == 422
    assert client.patch(url, json={"max_percent": "-1"}).status_code == 422
    assert client.patch(url, json={"name": "hacked"}).status_code == 422  # name is not editable


def test_unknown_rule(client):
    assert client.patch("/api/rules/9999", json={"is_active": False}).status_code == 404
