from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401
from app.db import Base, get_session
from app.main import app


@pytest.fixture
def session() -> Iterator[Session]:
    # SQLite em memória para testes rápidos; os modelos são portáveis para PostgreSQL.
    # StaticPool keeps a single connection so the TestClient thread sees the same in-memory DB.
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _record) -> None:
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    with Session(engine) as db:
        yield db
    engine.dispose()


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    """API client wired to the test database instead of PostgreSQL."""
    app.dependency_overrides[get_session] = lambda: session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
