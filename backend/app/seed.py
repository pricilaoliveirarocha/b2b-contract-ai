"""Popula o banco com DADOS FICTÍCIOS para desenvolvimento.

Empresas, pessoas e valores são inventados. Não use dados reais de clientes aqui.
Uso:  python -m app.seed
"""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.domain import ContractStatus, Priority, RuleSeverity, RuleType, Stage
from app.models import Company, Contract, ContractRequirement, Deal, Rule, StageHistory

DEMO_OWNER = "Responsável Demo"

# (empresa, segmento, área, estágio, valor, prioridade, dias até fechar)
DEMO_DEALS: list[tuple[str, str, str, Stage, str, Priority, int]] = [
    ("Exemplo Logística S.A.", "Logística", "Operações", Stage.DISCOVERY, "48000", Priority.MEDIUM, 120),
    ("Demo Saúde Ltda.", "Saúde", "TI", Stage.DISCOVERY, "95000", Priority.HIGH, 150),
    ("Fictícia Varejo", "Varejo", "Vendas", Stage.BUSINESS_CASE, "60000", Priority.LOW, 90),
    ("Teste Energia", "Energia", "Engenharia", Stage.POC, "210000", Priority.HIGH, 75),
    ("Modelo Seguros", "Seguros", "Jurídico", Stage.POC, "130000", Priority.MEDIUM, 80),
    ("Amostra Bancos", "Financeiro", "Segurança", Stage.INFOSEC, "380000", Priority.HIGH, 45),
    ("Protótipo Educação", "Educação", "Acadêmico", Stage.INFOSEC, "52000", Priority.LOW, 50),
    ("Simulada Telecom", "Telecom", "Compras", Stage.CONTRACTS, "275000", Priority.HIGH, 20),
    ("Ensaio Agro", "Agronegócio", "Diretoria", Stage.CONTRACTS, "88000", Priority.MEDIUM, 25),
    ("Piloto Indústria", "Indústria", "Operações", Stage.CLOSED_WON, "420000", Priority.HIGH, -5),
    ("Rascunho Mídia", "Mídia", "Marketing", Stage.CLOSED_LOST, "35000", Priority.LOW, -10),
]

DEMO_RULES: list[dict] = [
    {
        "name": "DPA assinado antes de fechar",
        "description": "Contrato só pode ir para Closed/Won com o DPA (LGPD) assinado.",
        "rule_type": RuleType.REQUIREMENT_DONE,
        "target_stage": Stage.CLOSED_WON,
        "severity": RuleSeverity.BLOCK,
        "params": {"requirement_kind": "dpa"},
    },
    {
        "name": "Questionário de segurança antes de Contratos",
        "description": "Deals só avançam para Contratos/Negociação após o questionário de InfoSec.",
        "rule_type": RuleType.REQUIREMENT_DONE,
        "target_stage": Stage.CONTRACTS,
        "severity": RuleSeverity.BLOCK,
        "params": {"requirement_kind": "security_questionnaire"},
    },
    {
        "name": "Desconto acima de 15%",
        "description": "Descontos acima do padrão geram alerta para revisão comercial.",
        "rule_type": RuleType.MAX_DISCOUNT,
        "target_stage": Stage.CLOSED_WON,
        "severity": RuleSeverity.WARN,
        "params": {"max_percent": 15},
    },
    {
        "name": "Aprovação da diretoria acima de R$ 250 mil",
        "description": "Contratos de valor alto exigem aprovação registrada antes de fechar.",
        "rule_type": RuleType.APPROVAL_ABOVE_VALUE,
        "target_stage": Stage.CLOSED_WON,
        "severity": RuleSeverity.BLOCK,
        "params": {"min_value": 250000, "requirement_kind": "board_approval"},
    },
]

REQUIREMENT_LABELS = {
    "dpa": "DPA (acordo de tratamento de dados) assinado",
    "security_questionnaire": "Questionário de segurança respondido",
    "board_approval": "Aprovação da diretoria",
}

STAGE_ORDER = [Stage.DISCOVERY, Stage.BUSINESS_CASE, Stage.POC, Stage.INFOSEC, Stage.CONTRACTS]


def seed(session: Session) -> bool:
    """Insere os dados de demonstração. Retorna False se o banco já tiver dados."""
    if session.scalar(select(Company.id).limit(1)) is not None:
        return False

    now = datetime.now(UTC)
    today = now.date()

    for rule_data in DEMO_RULES:
        session.add(Rule(**rule_data))

    for index, (name, segment, area, stage, value, priority, days) in enumerate(DEMO_DEALS):
        company = Company(name=name, segment=segment)
        deal = Deal(
            company=company,
            title=f"{name} ({area})",
            area=area,
            stage=stage,
            value=Decimal(value),
            priority=priority,
            close_date=today + timedelta(days=days),
            owner=DEMO_OWNER,
            last_touched_at=now - timedelta(days=index * 3),
        )

        # Histórico: percorre os estágios até o atual.
        path = _stage_path(stage)
        previous: Stage | None = None
        for step, to_stage in enumerate(path):
            deal.stage_history.append(
                StageHistory(
                    from_stage=previous,
                    to_stage=to_stage,
                    changed_at=now - timedelta(days=(len(path) - step) * 7),
                    changed_by=DEMO_OWNER,
                )
            )
            previous = to_stage

        # Checklist e contrato a partir de InfoSec.
        if stage in (Stage.INFOSEC, Stage.CONTRACTS, Stage.CLOSED_WON):
            past_infosec = stage != Stage.INFOSEC
            deal.requirements.append(_requirement("security_questionnaire", done=past_infosec, now=now))
            deal.requirements.append(_requirement("dpa", done=stage == Stage.CLOSED_WON, now=now))
            if Decimal(value) >= 250000:
                deal.requirements.append(
                    _requirement("board_approval", done=stage == Stage.CLOSED_WON, now=now)
                )
            deal.contract = Contract(
                status=ContractStatus.SIGNED if stage == Stage.CLOSED_WON else ContractStatus.IN_REVIEW,
                total_value=Decimal(value),
                duration_months=12 if index % 2 else 24,
                start_date=today + timedelta(days=max(days, 0) + 15),
                payment_terms="Mensal, 30 dias após emissão da nota",
                discount_percent=Decimal("18") if stage == Stage.CONTRACTS and index % 2 == 0 else Decimal("10"),
            )

        session.add(deal)

    session.commit()
    return True


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
        created = seed(db)
    print("Dados fictícios inseridos." if created else "Banco já possui dados; nada foi alterado.")
