from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas import TrendOut
from app.services.stats import pipeline_trend

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/trend", response_model=TrendOut)
def trend(
    session: Annotated[Session, Depends(get_session)],
    weeks: Annotated[int, Query(ge=2, le=26)] = 8,
) -> dict:
    """Weekly pipeline snapshots (oldest first) for the summary cards' sparklines."""
    return {"points": pipeline_trend(session, weeks)}
