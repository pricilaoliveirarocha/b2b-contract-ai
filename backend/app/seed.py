"""Load SAMPLE DATA for local development.

Every company, person and amount below is invented to look like a realistic B2B
pipeline. Any resemblance to real businesses is coincidental. Never put real
customer data here.

Usage:
    python -m app.seed           # only seeds an empty database
    python -m app.seed --reset   # wipes the sample tables and seeds again
"""

import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.domain import ContractStatus, Priority, RuleSeverity, RuleType, Stage
from app.models import Company, Contract, ContractRequirement, Deal, Rule, StageHistory


@dataclass(frozen=True)
class DemoDeal:
    company: str
    segment: str
    title: str
    area: str
    stage: Stage
    value: str
    priority: Priority
    days_to_close: int
    owner: str
    notes: str | None = None
    discount: str = "10"  # contract discount (%), used from Infosec onwards
    infosec_done: bool = False  # security questionnaire already answered


DEMO_DEALS: list[DemoDeal] = [
    # Discovery
    DemoDeal("Rota Sul Transportes", "Logistics", "Fleet telemetry rollout", "Operations",
             Stage.DISCOVERY, "96000", Priority.MEDIUM, 120, "Camila Duarte",
             "Inbound lead from webinar. 140 trucks across 3 hubs."),
    DemoDeal("Clínica Horizonte Saúde", "Healthcare", "Patient scheduling automation", "IT",
             Stage.DISCOVERY, "72000", Priority.HIGH, 140, "Rafael Moura",
             "Requires LGPD-compliant hosting in Brazil."),
    DemoDeal("Cooperativa Grão Forte", "Agribusiness", "Harvest forecasting pilot", "Operations",
             Stage.DISCOVERY, "54000", Priority.LOW, 160, "Juliana Prado"),
    # Business case
    DemoDeal("Varejo Bem Viver", "Retail", "Omnichannel inventory sync", "Sales",
             Stage.BUSINESS_CASE, "128000", Priority.MEDIUM, 95, "Camila Duarte",
             "ROI model shared with the CFO; waiting on feedback."),
    DemoDeal("Construtora Alicerce", "Construction", "Project cost tracking", "Finance",
             Stage.BUSINESS_CASE, "84000", Priority.LOW, 100, "Lucas Ferraz"),
    # POC
    DemoDeal("Energia Clara Renováveis", "Energy", "Asset maintenance analytics", "Engineering",
             Stage.POC, "215000", Priority.HIGH, 70, "Rafael Moura",
             "POC running on 2 solar parks. Success criteria: 15% fewer site visits."),
    DemoDeal("Seguradora Amparo", "Insurance", "Claims triage workflow", "Legal",
             Stage.POC, "168000", Priority.MEDIUM, 75, "Juliana Prado"),
    DemoDeal("Escola Nova Trilha", "Education", "Student retention dashboard", "Academic",
             Stage.POC, "46000", Priority.LOW, 85, "Lucas Ferraz"),
    # Infosec
    DemoDeal("Banco Ipê Digital", "Financial services", "Credit risk analytics platform", "Security",
             Stage.INFOSEC, "390000", Priority.HIGH, 45, "Camila Duarte",
             "Security team asked for a pen test report before signing."),
    DemoDeal("Rede Farma Vital", "Pharmacy retail", "Store replenishment forecasting", "Supply chain",
             Stage.INFOSEC, "112000", Priority.MEDIUM, 50, "Rafael Moura",
             "Questionnaire approved; legal review scheduled.", infosec_done=True),
    # Contracts
    DemoDeal("TeleConecta Fibra", "Telecom", "Field service optimization", "Procurement",
             Stage.CONTRACTS, "275000", Priority.HIGH, 20, "Juliana Prado",
             "Board meeting on the 10th to approve the budget.", discount="12"),
    DemoDeal("Agro Vale Verde", "Agribusiness", "Supplier contract hub", "Executive board",
             Stage.CONTRACTS, "88000", Priority.MEDIUM, 25, "Lucas Ferraz",
             "Asked for 18% off to sign this quarter.", discount="18"),
    DemoDeal("Hotel Brisa Mar", "Hospitality", "Revenue management add-on", "Commercial",
             Stage.CONTRACTS, "64000", Priority.LOW, 15, "Camila Duarte"),
    # Won
    DemoDeal("Metalúrgica Forja Nobre", "Manufacturing", "Predictive maintenance suite", "Operations",
             Stage.CLOSED_WON, "420000", Priority.HIGH, -5, "Rafael Moura",
             "3-year agreement. Kickoff planned for next month."),
    DemoDeal("Laboratório Precisa", "Diagnostics", "Sample tracking module", "IT",
             Stage.CLOSED_WON, "98000", Priority.MEDIUM, -12, "Juliana Prado", discount="8"),
    # Lost
    DemoDeal("Agência Pixel Norte", "Media", "Campaign performance reporting", "Marketing",
             Stage.CLOSED_LOST, "35000", Priority.LOW, -10, "Lucas Ferraz",
             "Chose to build in-house."),
    DemoDeal("Expressa Cerrado Logística", "Logistics", "Route planning", "Operations",
             Stage.CLOSED_LOST, "142000", Priority.MEDIUM, -20, "Camila Duarte",
             "Budget frozen for the fiscal year."),
]

DEMO_RULES: list[dict] = [
    {
        "name": "Signed DPA before closing",
        "description": "A deal can only be marked Won once the DPA (LGPD) is signed.",
        "rule_type": RuleType.REQUIREMENT_DONE,
        "target_stage": Stage.CLOSED_WON,
        "severity": RuleSeverity.BLOCK,
        "params": {"requirement_kind": "dpa"},
    },
    {
        "name": "Security questionnaire before Contracts",
        "description": "Deals only move to Contracts after the infosec questionnaire is answered.",
        "rule_type": RuleType.REQUIREMENT_DONE,
        "target_stage": Stage.CONTRACTS,
        "severity": RuleSeverity.BLOCK,
        "params": {"requirement_kind": "security_questionnaire"},
    },
    {
        "name": "Discount above 15%",
        "description": "Discounts above the standard limit are flagged for commercial review.",
        "rule_type": RuleType.MAX_DISCOUNT,
        "target_stage": Stage.CLOSED_WON,
        "severity": RuleSeverity.WARN,
        "params": {"max_percent": 15},
    },
    {
        "name": "Board approval above R$ 250k",
        "description": "High-value contracts need a recorded board approval before closing.",
        "rule_type": RuleType.APPROVAL_ABOVE_VALUE,
        "target_stage": Stage.CLOSED_WON,
        "severity": RuleSeverity.BLOCK,
        "params": {"min_value": 250000, "requirement_kind": "board_approval"},
    },
]

REQUIREMENT_LABELS = {
    "dpa": "Signed DPA (data processing agreement)",
    "security_questionnaire": "Security questionnaire answered",
    "board_approval": "Board approval",
}

BOARD_APPROVAL_THRESHOLD = Decimal("250000")
STAGE_ORDER = [Stage.DISCOVERY, Stage.BUSINESS_CASE, Stage.POC, Stage.INFOSEC, Stage.CONTRACTS]
CONTRACT_STAGES = (Stage.INFOSEC, Stage.CONTRACTS, Stage.CLOSED_WON)


def seed(session: Session) -> bool:
    """Insert the sample data. Returns False if the database already has data."""
    if session.scalar(select(Company.id).limit(1)) is not None:
        return False

    now = datetime.now(UTC)
    today = now.date()

    for rule_data in DEMO_RULES:
        session.add(Rule(**rule_data))

    for index, demo in enumerate(DEMO_DEALS):
        value = Decimal(demo.value)
        deal = Deal(
            company=Company(name=demo.company, segment=demo.segment),
            title=demo.title,
            area=demo.area,
            stage=demo.stage,
            value=value,
            priority=demo.priority,
            close_date=today + timedelta(days=demo.days_to_close),
            owner=demo.owner,
            last_touched_at=now - timedelta(days=index % 9, hours=index * 5),
            notes=demo.notes,
        )

        # History: walk through every stage up to the current one.
        path = _stage_path(demo.stage)
        # Spread over months like a real pipeline: deals further along were created earlier,
        # each stage lasts 2-4 weeks, and the last move happened a few days ago.
        last_move_days_ago = 4 + (index % 6) * 3
        days_per_stage = 16 + (index % 3) * 5
        previous: Stage | None = None
        for step, to_stage in enumerate(path):
            stages_after = len(path) - 1 - step
            deal.stage_history.append(
                StageHistory(
                    from_stage=previous,
                    to_stage=to_stage,
                    changed_at=now - timedelta(days=last_move_days_ago + stages_after * days_per_stage),
                    changed_by=demo.owner,
                )
            )
            previous = to_stage

        # Checklist and contract terms exist from Infosec onwards.
        if demo.stage in CONTRACT_STAGES:
            won = demo.stage == Stage.CLOSED_WON
            past_infosec = demo.stage != Stage.INFOSEC or demo.infosec_done
            deal.requirements.append(_requirement("security_questionnaire", done=past_infosec, now=now))
            deal.requirements.append(_requirement("dpa", done=won, now=now))
            if value >= BOARD_APPROVAL_THRESHOLD:
                deal.requirements.append(_requirement("board_approval", done=won, now=now))
            deal.contract = Contract(
                status=ContractStatus.SIGNED if won else ContractStatus.IN_REVIEW,
                total_value=value,
                duration_months=36 if value >= BOARD_APPROVAL_THRESHOLD else 12,
                start_date=today + timedelta(days=max(demo.days_to_close, 0) + 15),
                payment_terms="Monthly invoicing, net 30",
                discount_percent=Decimal(demo.discount),
            )

        session.add(deal)

    session.commit()
    return True


def reset(session: Session) -> None:
    """Delete all sample data (children first, to respect foreign keys)."""
    for model in (StageHistory, ContractRequirement, Contract, Deal, Company, Rule):
        session.execute(delete(model))
    session.commit()


def _stage_path(stage: Stage) -> list[Stage]:
    if stage == Stage.CLOSED_WON:
        return [*STAGE_ORDER, Stage.CLOSED_WON]
    if stage == Stage.CLOSED_LOST:
        return [Stage.DISCOVERY, Stage.BUSINESS_CASE, Stage.CLOSED_LOST]
    return STAGE_ORDER[: STAGE_ORDER.index(stage) + 1]


def _requirement(kind: str, *, done: bool, now: datetime) -> ContractRequirement:
    return ContractRequirement(
        kind=kind,
        label=REQUIREMENT_LABELS[kind],
        is_done=done,
        done_at=now if done else None,
    )


if __name__ == "__main__":
    with SessionLocal() as db:
        if "--reset" in sys.argv:
            reset(db)
            print("Sample data removed.")
        created = seed(db)
    print("Sample data loaded." if created else "Database already has data; nothing changed.")
