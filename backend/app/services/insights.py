"""Insights for the Rules page, computed from the deals and the rules themselves.

Everything here is plain arithmetic over real data: no estimates and no invented figures. Each insight is
a `kind` plus `params`; the interface writes the sentence in the user's language.
"""

from collections import Counter
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.domain import RuleType, Stage
from app.models import Deal, Rule
from app.services.analytics import CLOSED, pipeline_overview
from app.services.numbers import plain

MAX_INSIGHTS = 6
_SEVERITY_RANK = {"warning": 0, "opportunity": 1, "info": 2}
# Stages from which a deal is close to signing (used for the approval-gap insight).
_LATE_STAGES = (Stage.INFOSEC, Stage.CONTRACTS)
# Entering these stages can be checked by a rule.
_CHECKABLE_STAGES = (Stage.BUSINESS_CASE, Stage.POC, Stage.INFOSEC, Stage.CONTRACTS, Stage.CLOSED_WON)


@dataclass(frozen=True)
class Insight:
    kind: str
    severity: str  # "warning" | "opportunity" | "info"
    params: dict[str, str]


def build_insights(session: Session, today: date | None = None) -> list[Insight]:
    overview = pipeline_overview(session, today)
    rules = list(session.scalars(select(Rule).order_by(Rule.id)))
    active = [r for r in rules if r.is_active]
    open_deals = (
        session.scalars(
            select(Deal)
            .where(Deal.stage.not_in(CLOSED))
            .options(joinedload(Deal.contract), selectinload(Deal.requirements))
        )
        .unique()
        .all()
    )
    insights: list[Insight] = []

    # 1. The rule holding back the most value right now.
    if overview.rule_blockers:
        top = overview.rule_blockers[0]
        insights.append(
            Insight(
                "bottleneck",
                "warning",
                {
                    "rule_id": str(top.rule_id),
                    "rule_name": top.rule_name,
                    "deals": str(top.deals),
                    "value": str(top.value),
                    "avg_days": str(top.avg_days_stuck),
                },
            )
        )

    # 2. Deals past their expected close date.
    if overview.overdue_deals:
        worst = overview.overdue_deals[0]
        insights.append(
            Insight(
                "overdue",
                "warning",
                {
                    "count": str(overview.overdue_count),
                    "value": str(overview.overdue_value),
                    "worst_days": str(worst.days_overdue),
                    "worst_company": worst.company,
                },
            )
        )

    # 3. A discount limit that only applies at closing, while deals already exceed it earlier.
    discount_gap = _discount_gap(active, open_deals)
    if discount_gap:
        insights.append(discount_gap)

    # 4. An approval threshold that only applies at closing, while big deals are already close to signing.
    approval_gap = _approval_gap(active, open_deals)
    if approval_gap:
        insights.append(approval_gap)

    # 5. Lost deals piling up in one stage.
    lost = Counter(d.lost_from_stage for d in overview.lost_deals if d.lost_from_stage)
    if lost:
        stage, count = lost.most_common(1)[0]
        total = len(overview.lost_deals)
        if count >= 2 and count / total >= 0.5:
            value = sum(d.value for d in overview.lost_deals if d.lost_from_stage == stage)
            insights.append(
                Insight(
                    "lost_concentration",
                    "info",
                    {"stage": stage.value, "count": str(count), "total": str(total), "value": str(value)},
                )
            )

    # 6. Rules switched off.
    inactive = [r for r in rules if not r.is_active]
    if inactive:
        insights.append(
            Insight(
                "inactive_rules",
                "info",
                {"count": str(len(inactive)), "rule_id": str(inactive[0].id), "rule_name": inactive[0].name},
            )
        )

    # 7. Stages that no active rule checks.
    covered = {r.target_stage for r in active}
    uncovered = [s for s in _CHECKABLE_STAGES if s not in covered]
    if uncovered and rules:
        insights.append(Insight("uncovered_stages", "info", {"stages": ",".join(s.value for s in uncovered)}))

    insights.sort(key=lambda i: _SEVERITY_RANK[i.severity])  # stable: keeps the order above within a level
    return insights[:MAX_INSIGHTS]


def _discount_gap(active: list[Rule], open_deals: list[Deal]) -> Insight | None:
    # Limits that are already enforced before closing: they cover any later-stage limit that is looser.
    early_limits = [
        Decimal(str(r.params["max_percent"]))
        for r in active
        if r.rule_type == RuleType.MAX_DISCOUNT and r.target_stage in _LATE_STAGES
    ]
    best: tuple[int, Insight] | None = None
    for rule in active:
        if rule.rule_type != RuleType.MAX_DISCOUNT or rule.target_stage in _LATE_STAGES:
            continue
        limit = Decimal(str(rule.params["max_percent"]))
        if any(early <= limit for early in early_limits):
            continue
        over = [d for d in open_deals if d.contract is not None and d.contract.discount_percent > limit]
        if not over:
            continue
        insight = Insight(
            "discount_gap",
            "opportunity",
            {
                "rule_id": str(rule.id),
                "limit": plain(limit),
                "deals": str(len(over)),
                "value": str(sum(d.value for d in over)),
                "max_discount": plain(max(d.contract.discount_percent for d in over)),  # type: ignore[union-attr]
            },
        )
        if best is None or len(over) > best[0]:
            best = (len(over), insight)
    return best[1] if best else None


def _approval_gap(active: list[Rule], open_deals: list[Deal]) -> Insight | None:
    # Approvals already required before closing, as (threshold, item).
    early = [
        (Decimal(str(r.params["min_value"])), str(r.params["requirement_kind"]))
        for r in active
        if r.rule_type == RuleType.APPROVAL_ABOVE_VALUE and r.target_stage in _LATE_STAGES
    ]
    best: tuple[int, Insight] | None = None
    for rule in active:
        if rule.rule_type != RuleType.APPROVAL_ABOVE_VALUE or rule.target_stage in _LATE_STAGES:
            continue
        threshold = Decimal(str(rule.params["min_value"]))
        kind = str(rule.params["requirement_kind"])
        if any(item == kind and early_threshold <= threshold for early_threshold, item in early):
            continue
        waiting = [
            d
            for d in open_deals
            if d.stage in _LATE_STAGES
            and d.value >= threshold
            and not any(r.kind == kind and r.is_done for r in d.requirements)
        ]
        if not waiting:
            continue
        insight = Insight(
            "approval_gap",
            "opportunity",
            {
                "rule_id": str(rule.id),
                "threshold": plain(threshold),
                "requirement": kind,
                "deals": str(len(waiting)),
                "value": str(sum(d.value for d in waiting)),
            },
        )
        if best is None or len(waiting) > best[0]:
            best = (len(waiting), insight)
    return best[1] if best else None


__all__ = ["Insight", "build_insights"]
