"""Moving a deal to another stage. One function, used by the single and the bulk endpoints,
so the contract rules are applied in exactly the same way to both."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.domain import RuleSeverity, Stage
from app.models import Deal, StageHistory
from app.services.rules import RuleViolation, evaluate_rules


@dataclass(frozen=True)
class MoveOutcome:
    moved: bool
    warnings: list[RuleViolation]  # rules that only warn: the deal moved anyway
    blocking: list[RuleViolation]  # rules that stopped the move (the deal was not touched)


def attempt_move(session: Session, deal: Deal, target: Stage, now: datetime) -> MoveOutcome:
    """Check the rules for `target` and, if none blocks, move the deal and record the history.

    Does not commit: the caller decides when to save (or roll back).
    """
    violations = evaluate_rules(session, deal, target)
    blocking = [v for v in violations if v.severity == RuleSeverity.BLOCK]
    if blocking:
        return MoveOutcome(moved=False, warnings=[], blocking=blocking)

    session.add(StageHistory(deal_id=deal.id, from_stage=deal.stage, to_stage=target, changed_at=now))
    deal.stage = target
    deal.last_touched_at = now
    return MoveOutcome(moved=True, warnings=violations, blocking=[])
