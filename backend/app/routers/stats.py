from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas import InsightsOut, OverviewOut, TrendOut
from app.services.analytics import Overview, pipeline_overview
from app.services.insights import build_insights
from app.services.stats import pipeline_trend

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/trend", response_model=TrendOut)
def trend(
    session: Annotated[Session, Depends(get_session)],
    weeks: Annotated[int, Query(ge=2, le=26)] = 8,
) -> dict:
    """Weekly pipeline snapshots (oldest first) for the summary cards' sparklines."""
    return {"points": pipeline_trend(session, weeks)}


@router.get("/overview", response_model=OverviewOut)
def overview(session: Annotated[Session, Depends(get_session)]) -> Overview:
    """Everything the analytics dashboard needs, computed in one pass over the deals."""
    return pipeline_overview(session)


@router.get("/insights", response_model=InsightsOut)
def insights(session: Annotated[Session, Depends(get_session)]) -> dict:
    """Findings about the pipeline and its rules, computed from the data (see services/insights.py)."""
    return {"insights": build_insights(session)}
