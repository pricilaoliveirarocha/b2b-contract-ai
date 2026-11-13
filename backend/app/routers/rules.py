from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.domain import RuleType
from app.models import Rule
from app.schemas import RuleOut, RuleUpdateIn

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("", response_model=list[RuleOut])
def list_rules(session: Annotated[Session, Depends(get_session)]) -> list[Rule]:
    return list(session.scalars(select(Rule).order_by(Rule.id)))


@router.patch(
    "/{rule_id}",
    response_model=RuleOut,
    responses={404: {"description": "Rule not found"}, 422: {"description": "Field not valid for this rule"}},
)
def update_rule(
    rule_id: int, payload: RuleUpdateIn, session: Annotated[Session, Depends(get_session)]
) -> Rule:
    """Turn a rule on/off or change its threshold. Only the threshold of the rule's own type is accepted."""
    rule = session.get(Rule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Rule not found.")

    params = dict(rule.params or {})
    if payload.max_percent is not None:
        if rule.rule_type != RuleType.MAX_DISCOUNT:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="This rule has no discount limit.")
        params["max_percent"] = _number(payload.max_percent)
    if payload.min_value is not None:
        if rule.rule_type != RuleType.APPROVAL_ABOVE_VALUE:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="This rule has no value threshold.")
        params["min_value"] = _number(payload.min_value)

    rule.params = params  # reassign so SQLAlchemy notices the JSON change
    if payload.is_active is not None:
        rule.is_active = payload.is_active
    session.commit()
    return rule


def _number(value: Decimal) -> int | float:
    # Stored in JSON: keep whole numbers as ints (15, 250000) and the rest as floats.
    return int(value) if value == value.to_integral_value() else float(value)
