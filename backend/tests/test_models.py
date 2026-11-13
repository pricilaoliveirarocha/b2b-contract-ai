from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, StatementError

from app.domain import STAGE_PROBABILITY, Stage
from app.main import app
from app.models import Company, Contract, ContractRequirement, Deal, Rule, StageHistory
from app.seed import DEMO_DEALS, DEMO_RULES, seed


def test_seed_creates_demo_data(session):
    assert seed(session) is True

    assert session.scalar(select(func.count(Company.id))) == len(DEMO_DEALS)
    assert session.scalar(select(func.count(Deal.id))) == len(DEMO_DEALS)
    assert session.scalar(select(func.count(Rule.id))) == len(DEMO_RULES)
    assert session.scalar(select(func.count(Contract.id))) > 0
    assert session.scalar(select(func.count(StageHistory.id))) > 0


def test_seed_is_idempotent(session):
    seed(session)
    assert seed(session) is False
    assert session.scalar(select(func.count(Deal.id))) == len(DEMO_DEALS)


def test_stage_history_ends_at_current_stage(session):
    seed(session)
    for deal in session.scalars(select(Deal)):
        assert deal.stage_history[-1].to_stage == deal.stage


def test_closed_won_deals_have_all_requirements_done(session):
    seed(session)
    won = session.scalars(select(Deal).where(Deal.stage == Stage.CLOSED_WON)).all()
    assert won
    for deal in won:
        assert all(req.is_done for req in deal.requirements)


def test_every_stage_has_probability():
    assert set(STAGE_PROBABILITY) == set(Stage)


def test_rejects_negative_deal_value(session):
    session.add(Deal(company=Company(name="Teste"), title="Inválido", value=Decimal("-1")))
    with pytest.raises(IntegrityError):
        session.commit()


def test_rejects_unknown_stage(session):
    session.add(Deal(company=Company(name="Teste"), title="Inválido", stage="estagio_inexistente"))
    with pytest.raises(StatementError):
        session.commit()


def test_requirement_kind_is_unique_per_deal(session):
    deal = Deal(company=Company(name="Teste"), title="Deal")
    deal.requirements.append(ContractRequirement(kind="dpa", label="DPA"))
    deal.requirements.append(ContractRequirement(kind="dpa", label="DPA duplicado"))
    session.add(deal)
    with pytest.raises(IntegrityError):
        session.commit()


def test_health_endpoint():
    response = TestClient(app).get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
