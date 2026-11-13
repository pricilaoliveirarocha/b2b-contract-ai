"""Contract rule evaluation: decides whether a deal may enter a stage."""

from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain import RuleSeverity, RuleType, Stage
from app.models import Deal, Rule

# Stable violation codes. Clients translate them using `params`; `message` is the English fallback.
REQUIREMENT_MISSING = "requirement_missing"
REQUIREMENT_NOT_DONE = "requirement_not_done"
DISCOUNT_ABOVE_LIMIT = "discount_above_limit"
UNSUPPORTED_RULE = "unsupported_rule"


@dataclass(frozen=True)
class RuleViolation:
    rule_id: int
    rule_name: str
    severity: RuleSeverity
    code: str
    message: str
    params: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class _Problem:
    code: str
    message: str
    params: dict[str, str]


def evaluate_rules(session: Session, deal: Deal, target_stage: Stage) -> list[RuleViolation]:
    """Return every active rule for `target_stage` that the deal currently breaks."""
    rules = session.scalars(
        select(Rule)
        .where(Rule.target_stage == target_stage, Rule.is_active.is_(True))
        .order_by(Rule.id)
    )
    violations = []
    for rule in rules:
        problem = _check(rule, deal)
        if problem is not None:
            violations.append(
                RuleViolation(
                    rule_id=rule.id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    code=problem.code,
                    message=problem.message,
                    params=problem.params,
                )
            )
    return violations


def _check(rule: Rule, deal: Deal) -> _Problem | None:
    """Describe how the rule is broken, or return None if the deal complies."""
    params = rule.params or {}

    if rule.rule_type == RuleType.REQUIREMENT_DONE:
        return _missing_requirement(deal, params["requirement_kind"])

    if rule.rule_type == RuleType.MAX_DISCOUNT:
        max_percent = Decimal(str(params["max_percent"]))
        if deal.contract is not None and deal.contract.discount_percent > max_percent:
            discount = deal.contract.discount_percent.normalize()
            limit = max_percent.normalize()
            return _Problem(
                DISCOUNT_ABOVE_LIMIT,
                f"Discount of {discount}% is above the {limit}% limit.",
                {"discount": str(discount), "max": str(limit)},
            )
        return None

    if rule.rule_type == RuleType.APPROVAL_ABOVE_VALUE:
        min_value = Decimal(str(params["min_value"]))
        if deal.value >= min_value:
            return _missing_requirement(deal, params["requirement_kind"])
        return None

    # Unknown rule types must not silently let a deal through.
    return _Problem(
        UNSUPPORTED_RULE, f"Unsupported rule type: {rule.rule_type}.", {"rule_type": str(rule.rule_type)}
    )


def _missing_requirement(deal: Deal, kind: str) -> _Problem | None:
    requirement = next((r for r in deal.requirements if r.kind == kind), None)
    if requirement is None:
        return _Problem(
            REQUIREMENT_MISSING,
            f"Required item '{kind}' is missing from the checklist.",
            {"requirement": kind},
        )
    if not requirement.is_done:
        return _Problem(
            REQUIREMENT_NOT_DONE,
            f"Required item not completed: {requirement.label}.",
            {"requirement": kind, "label": requirement.label},
        )
    return None
