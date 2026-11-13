from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app import models  # noqa: F401
from app.db import Base


@pytest.fixture
def session() -> Iterator[Session]:
    # SQLite em memória para testes rápidos; os modelos são portáveis para PostgreSQL.
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _record) -> None:
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    with Session(engine) as db:
        yield db
    engine.dispose()
