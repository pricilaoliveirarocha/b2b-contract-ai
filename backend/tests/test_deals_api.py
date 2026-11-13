from decimal import Decimal

from app.domain import Stage
from app.seed import DEMO_DEALS, seed


def test_list_deals_returns_all_seeded_deals(client, session):
    seed(session)

    response = client.get("/api/deals")

    assert response.status_code == 200
    deals = response.json()
    assert len(deals) == len(DEMO_DEALS)
    first = deals[0]
    assert set(first) == {
        "id", "title", "company", "area", "stage", "value", "currency",
        "priority", "close_date", "owner", "last_touched_at",
    }
    assert set(first["company"]) == {"id", "name"}


def test_list_deals_does_not_expose_internal_fields(client, session):
    seed(session)

    deal = client.get("/api/deals").json()[0]

    assert "notes" not in deal
    assert "contract" not in deal
    assert "requirements" not in deal


def test_list_deals_keeps_value_precision(client, session):
    seed(session)

    for deal in client.get("/api/deals").json():
        assert isinstance(deal["value"], str)
        assert Decimal(deal["value"]) >= 0


def test_list_deals_filters_by_stage(client, session):
    seed(session)

    response = client.get("/api/deals", params={"stage": Stage.CONTRACTS.value})

    assert response.status_code == 200
    deals = response.json()
    assert deals
    assert all(deal["stage"] == Stage.CONTRACTS.value for deal in deals)


def test_list_deals_rejects_unknown_stage(client):
    response = client.get("/api/deals", params={"stage": "not_a_stage"})
    assert response.status_code == 422


def test_list_deals_paginates(client, session):
    seed(session)

    page_1 = client.get("/api/deals", params={"limit": 3}).json()
    page_2 = client.get("/api/deals", params={"limit": 3, "offset": 3}).json()

    assert len(page_1) == 3
    assert len(page_2) == 3
    assert {d["id"] for d in page_1}.isdisjoint({d["id"] for d in page_2})


def test_list_deals_rejects_limit_out_of_range(client):
    assert client.get("/api/deals", params={"limit": 0}).status_code == 422
    assert client.get("/api/deals", params={"limit": 501}).status_code == 422


def test_list_deals_empty_database(client):
    response = client.get("/api/deals")
    assert response.status_code == 200
    assert response.json() == []
