from dataclasses import asdict
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db import get_session
from app.domain import RuleSeverity, Stage
from app.models import Deal, StageHistory
from app.schemas import DealOut, StageChangeIn, StageChangeOut
from app.services.rules import evaluate_rules

router = APIRouter(prefix="/api/deals", tags=["deals"])


@router.get("", response_model=list[DealOut])
def list_deals(
    session: Annotated[Session, Depends(get_session)],
    stage: Stage | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Deal]:
    """List deals for the pipeline board, optionally filtered by stage."""
    query = (
        select(Deal)
        .options(joinedload(Deal.company))  # avoids one extra query per deal
        .order_by(Deal.close_date.asc().nulls_last(), Deal.id)
        .limit(limit)
        .offset(offset)
    )
    if stage is not None:
        query = query.where(Deal.stage == stage)
    return list(session.scalars(query))


@router.patch(
    "/{deal_id}/stage",
    response_model=StageChangeOut,
    responses={
        400: {"description": "Deal is already in this stage"},
        404: {"description": "Deal not found"},
        409: {"description": "Blocked by one or more contract rules"},
    },
)
def change_stage(
    deal_id: int,
    payload: StageChangeIn,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """Move a deal to another stage after checking the contract rules.

    Blocking rules reject the change (409) and nothing is saved.
    Warning rules let it through and are returned alongside the updated deal.
    """
    deal = session.scalar(
        select(Deal)
        .where(Deal.id == deal_id)
        .options(
            joinedload(Deal.company),
            joinedload(Deal.contract),
            selectinload(Deal.requirements),
        )
        .with_for_update(of=Deal)  # serialize concurrent moves of the same deal
    )
    if deal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Deal not found.")
    if deal.stage == payload.stage:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Deal is already in this stage.")

    violations = evaluate_rules(session, deal, payload.stage)
    blocking = [v for v in violations if v.severity == RuleSeverity.BLOCK]
    if blocking:
        session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "message": "Stage change blocked by contract rules.",
                "violations": [asdict(v) for v in blocking],
            },
        )

    now = datetime.now(UTC)
    session.add(StageHistory(deal_id=deal.id, from_stage=deal.stage, to_stage=payload.stage, changed_at=now))
    deal.stage = payload.stage
    deal.last_touched_at = now
    session.commit()

    return {"deal": deal, "warnings": [asdict(v) for v in violations]}
