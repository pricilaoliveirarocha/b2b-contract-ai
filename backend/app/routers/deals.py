from dataclasses import asdict
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db import get_session
from app.domain import Stage
from app.models import Deal
from app.schemas import (
    BulkStageIn,
    BulkStageOut,
    DealDetailOut,
    DealOut,
    StageChangeIn,
    StageChangeOut,
)
from app.services.moves import attempt_move

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


@router.get("/{deal_id}", response_model=DealDetailOut, responses={404: {"description": "Deal not found"}})
def get_deal(deal_id: int, session: Annotated[Session, Depends(get_session)]) -> Deal:
    """One deal with its contract terms, checklist and stage history."""
    deal = session.scalar(
        select(Deal)
        .where(Deal.id == deal_id)
        .options(
            joinedload(Deal.company),
            joinedload(Deal.contract),
            selectinload(Deal.requirements),
            selectinload(Deal.stage_history),
        )
    )
    if deal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Deal not found.")
    return deal


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

    outcome = attempt_move(session, deal, payload.stage, datetime.now(UTC))
    if not outcome.moved:
        session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "message": "Stage change blocked by contract rules.",
                "violations": [asdict(v) for v in outcome.blocking],
            },
        )
    session.commit()

    return {"deal": deal, "warnings": [asdict(v) for v in outcome.warnings]}


@router.post(
    "/bulk-stage",
    response_model=BulkStageOut,
    responses={422: {"description": "Empty or too long list, or unknown stage"}},
)
def bulk_change_stage(payload: BulkStageIn, session: Annotated[Session, Depends(get_session)]) -> dict:
    """Move several deals to one stage. The contract rules are checked for EACH deal.

    Deals that pass are moved; deals blocked by a rule are left untouched and reported, so one
    blocked deal never stops the others. Everything that moved is saved together.
    """
    ids = list(dict.fromkeys(payload.deal_ids))  # drop duplicates, keep the order
    found = {
        deal.id: deal
        for deal in session.scalars(
            select(Deal)
            .where(Deal.id.in_(ids))
            .options(
                joinedload(Deal.company),
                joinedload(Deal.contract),
                selectinload(Deal.requirements),
            )
            .order_by(Deal.id)  # always lock in the same order, so two bulk moves can't deadlock
            .with_for_update(of=Deal)
        ).unique()
    }

    now = datetime.now(UTC)
    results: list[dict] = []
    moved: list[Deal] = []
    for deal_id in ids:
        deal = found.get(deal_id)
        if deal is None:
            results.append({"deal_id": deal_id, "status": "not_found", "warnings": [], "violations": []})
        elif deal.stage == payload.stage:
            results.append({"deal_id": deal_id, "status": "unchanged", "warnings": [], "violations": []})
        else:
            outcome = attempt_move(session, deal, payload.stage, now)
            if outcome.moved:
                moved.append(deal)
            results.append(
                {
                    "deal_id": deal_id,
                    "status": "moved" if outcome.moved else "blocked",
                    "warnings": [asdict(v) for v in outcome.warnings],
                    "violations": [asdict(v) for v in outcome.blocking],
                }
            )
    session.commit()

    counts = {name: sum(1 for r in results if r["status"] == name) for name in ("moved", "blocked", "unchanged", "not_found")}
    return {**counts, "results": results, "deals": moved}
