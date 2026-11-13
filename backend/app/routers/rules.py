from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.db import get_session
from app.domain import RuleType
from app.models import Rule
from app.schemas import RuleCreateIn, RuleDraftIn, RuleDraftOut, RuleOut, RuleUpdateIn
from app.services import rule_ai

router = APIRouter(prefix="/api/rules", tags=["rules"])

# Which parameters each rule type understands.
PARAM_FIELDS: dict[RuleType, tuple[str, ...]] = {
    RuleType.REQUIREMENT_DONE: ("requirement_kind",),
    RuleType.MAX_DISCOUNT: ("max_percent",),
    RuleType.APPROVAL_ABOVE_VALUE: ("min_value", "requirement_kind"),
}
ADMIN = Depends(require_admin)  # reading is open; every change needs the administrator token

# Fields that must not be set to null in an update (only the description may be cleared).
NOT_NULLABLE = {"name", "target_stage", "severity", "is_active", "requirement_kind", "max_percent", "min_value"}


@router.get("", response_model=list[RuleOut])
def list_rules(session: Annotated[Session, Depends(get_session)]) -> list[Rule]:
    return list(session.scalars(select(Rule).order_by(Rule.id)))


@router.post(
    "",
    response_model=RuleOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[ADMIN],
    responses={401: {"description": "Invalid token"}, 403: {"description": "Admin disabled"}},
)
def create_rule(payload: RuleCreateIn, session: Annotated[Session, Depends(get_session)]) -> Rule:
    rule = Rule(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        rule_type=payload.rule_type,
        target_stage=payload.target_stage,
        severity=payload.severity,
        is_active=payload.is_active,
        params={field: _json_value(getattr(payload, field)) for field in PARAM_FIELDS[payload.rule_type]},
    )
    session.add(rule)
    session.commit()
    return rule


@router.post(
    "/draft",
    response_model=RuleDraftOut,
    dependencies=[ADMIN],
    responses={
        422: {"description": "The text can't become a valid rule"},
        502: {"description": "The AI service failed; try again"},
        503: {"description": "AI generation is not configured on this server"},
    },
)
def draft_rule_from_text(payload: RuleDraftIn) -> RuleDraftOut:
    """Turn a plain-language description into a rule DRAFT. Administrators only; nothing is saved."""
    try:
        draft = rule_ai.draft_rule(payload.text)
    except rule_ai.AiNotConfigured:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI rule generation is not configured.")
    except rule_ai.DraftRejected as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except rule_ai.AiUnavailable:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="The AI service could not complete the request.")
    return RuleDraftOut(rule=draft.rule, explanation=draft.explanation)


@router.patch(
    "/{rule_id}",
    response_model=RuleOut,
    dependencies=[ADMIN],
    responses={404: {"description": "Rule not found"}, 422: {"description": "Field not valid for this rule"}},
)
def update_rule(
    rule_id: int, payload: RuleUpdateIn, session: Annotated[Session, Depends(get_session)]
) -> Rule:
    """Edit a rule. Parameters that don't belong to the rule's type are rejected."""
    rule = session.get(Rule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Rule not found.")

    changes = {field: getattr(payload, field) for field in payload.model_fields_set}
    for field, value in changes.items():
        if value is None and field in NOT_NULLABLE:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field} cannot be empty.")

    allowed = PARAM_FIELDS[rule.rule_type]
    params: dict[str, Any] = dict(rule.params or {})
    for field in ("requirement_kind", "max_percent", "min_value"):
        if field in changes:
            if field not in allowed:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"{field} does not apply to {rule.rule_type.value} rules.",
                )
            params[field] = _json_value(changes[field])
    rule.params = params  # reassign so SQLAlchemy notices the JSON change

    if "name" in changes:
        rule.name = payload.name.strip()  # type: ignore[union-attr]  # not None: checked above
    if "description" in changes:
        rule.description = payload.description.strip() if payload.description else None
    if "target_stage" in changes:
        rule.target_stage = payload.target_stage  # type: ignore[assignment]
    if "severity" in changes:
        rule.severity = payload.severity  # type: ignore[assignment]
    if "is_active" in changes:
        rule.is_active = bool(payload.is_active)

    session.commit()
    return rule


@router.delete(
    "/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[ADMIN],
    responses={404: {"description": "Rule not found"}},
)
def delete_rule(rule_id: int, session: Annotated[Session, Depends(get_session)]) -> Response:
    """Permanently remove a rule. Deals already moved are not affected; future moves stop checking it."""
    rule = session.get(Rule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Rule not found.")
    session.delete(rule)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _json_value(value: Any) -> Any:
    # Stored in JSON: whole numbers as ints (15, 250000), other decimals as floats.
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    return value
