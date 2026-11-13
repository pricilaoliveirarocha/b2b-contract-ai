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
    area: str  # buying department
    stage: Stage
    value: str
    priority: Priority
    days_to_close: int
    owner: str
    notes: str | None = None
    discount: str = "10"  # contract discount (%), used from Infosec onwards
    infosec_done: bool = False  # security questionnaire already answered
    payment_terms: str = "Faturamento mensal, 30 dias"
    duration_months: int = 12


# Sample data is in Brazilian Portuguese, like a Brazilian company's CRM (code stays in English).
# Notes are written the way a sales rep would: context, who champions the deal, next step, risk.
DEMO_DEALS: list[DemoDeal] = [
    # Discovery
    DemoDeal(
        "Rota Sul Transportes", "Logística", "Telemetria de frota · 140 caminhões, 3 bases", "Operações",
        Stage.DISCOVERY, "96000", Priority.MEDIUM, 120, "Camila Duarte",
        "Lead do webinar de cadeia fria. O gerente de operações quer reduzir tempo ocioso e "
        "furto de combustível; hoje as viagens são controladas em planilha. Próximo passo: "
        "reunião de descoberta com o gestor de frota para mapear os contratos de rastreador "
        "(dois vencem em março).",
    ),
    DemoDeal(
        "Clínica Horizonte Saúde", "Saúde", "Agendamento de pacientes · 4 clínicas", "TI",
        Stage.DISCOVERY, "72000", Priority.HIGH, 140, "Rafael Moura",
        "Taxa de faltas em torno de 22% e central de atendimento sobrecarregada. O diretor de "
        "TI exige dados hospedados no Brasil e registro de consentimento (LGPD). Próximo "
        "passo: demonstrar os lembretes por WhatsApp ao diretor clínico.",
    ),
    DemoDeal(
        "Cooperativa Grão Forte", "Agronegócio", "Piloto de previsão de safra · 38 fazendas",
        "Operações",
        Stage.DISCOVERY, "54000", Priority.LOW, 160, "Juliana Prado",
        "Indicação da Agro Vale Verde. Há interesse, mas o orçamento só abre depois da colheita "
        "da soja (abril). Manter contato; enviar um estudo de caso em fevereiro.",
    ),
    # Business case
    DemoDeal(
        "Varejo Bem Viver", "Varejo", "Estoque omnichannel · 62 lojas", "Vendas",
        Stage.BUSINESS_CASE, "128000", Priority.MEDIUM, 95, "Camila Duarte",
        "Perdendo vendas online por divergência de estoque entre e-commerce e lojas. Modelo de "
        "ROI (retorno em 7 meses) enviado ao CFO. Aguardando retorno; o congelamento de "
        "sistemas da Black Friday começa em meados de novembro.",
    ),
    DemoDeal(
        "Construtora Alicerce", "Construção civil", "Controle de custos de obras · 12 canteiros",
        "Financeiro",
        Stage.BUSINESS_CASE, "84000", Priority.LOW, 100, "Lucas Ferraz",
        "A controladoria quer substituir os relatórios mensais em Excel de cada obra. Estão "
        "comparando a nossa solução com o módulo adicional do ERP. Próximo passo: sessão com "
        "o CFO sobre custo total.",
    ),
    # POC
    DemoDeal(
        "Energia Clara Renováveis", "Energia", "Manutenção preditiva · 2 usinas solares",
        "Engenharia",
        Stage.POC, "215000", Priority.HIGH, 70, "Rafael Moura",
        "POC rodando em 2 usinas solares com 6 semanas de dados dos inversores. Critério de "
        "sucesso combinado: 15% menos visitas técnicas não planejadas. O líder de engenharia é "
        "um forte defensor; revisão de meio de POC na quinta-feira.",
    ),
    DemoDeal(
        "Seguradora Amparo", "Seguros", "Triagem de sinistros · ramo automóvel", "Jurídico",
        Stage.POC, "168000", Priority.MEDIUM, 75, "Juliana Prado",
        "Testando a triagem com 3 meses de sinistros de automóvel anonimizados. O jurídico tem "
        "receio de decisões automatizadas, então a solução foi posicionada só como apoio à "
        "decisão. Risco: a POC atrasou uma semana esperando a extração dos dados.",
    ),
    DemoDeal(
        "Escola Nova Trilha", "Educação", "Painel de evasão de alunos · 3 campi", "Acadêmico",
        Stage.POC, "46000", Priority.LOW, 85, "Lucas Ferraz",
        "Piloto com os cursos noturnos, onde a evasão é maior. A coordenadora acadêmica gostou, "
        "mas quem decide o orçamento é o reitor. Próximo passo: apresentar os primeiros "
        "resultados na reunião do conselho.",
    ),
    # Infosec
    DemoDeal(
        "Banco Ipê Digital", "Serviços financeiros", "Plataforma de análise de risco de crédito",
        "Segurança da informação",
        Stage.INFOSEC, "390000", Priority.HIGH, 45, "Camila Duarte",
        "A área de negócio aprovou. A segurança enviou um questionário de 180 perguntas e pediu "
        "um relatório de pentest recente e o checklist de terceirização do BACEN. O "
        "questionário está 70% respondido e é o que bloqueia a ida para Contratos.",
        duration_months=36, payment_terms="Faturamento anual, 30 dias",
    ),
    DemoDeal(
        "Rede Farma Vital", "Farmácias", "Reposição de estoque · 210 farmácias", "Suprimentos",
        Stage.INFOSEC, "112000", Priority.MEDIUM, 50, "Rafael Moura",
        "Questionário de segurança aprovado sem apontamentos. Revisão jurídica do contrato "
        "marcada para a próxima semana. O diretor de suprimentos quer entrar em produção antes "
        "da temporada de gripe.",
        infosec_done=True, payment_terms="Faturamento trimestral, 45 dias",
    ),
    # Contracts
    DemoDeal(
        "TeleConecta Fibra", "Telecomunicações", "Otimização de equipes de campo · 900 técnicos",
        "Compras",
        Stage.CONTRACTS, "275000", Priority.HIGH, 20, "Juliana Prado",
        "Compras aceitou 12% de desconto num contrato de 3 anos. Acima de R$ 250 mil é preciso "
        "aprovação da diretoria: reunião no dia 10. A minuta do DPA está com o jurídico deles.",
        discount="12", duration_months=36, payment_terms="Faturamento anual, 30 dias",
    ),
    DemoDeal(
        "Agro Vale Verde", "Agronegócio", "Central de contratos com fornecedores", "Diretoria",
        Stage.CONTRACTS, "88000", Priority.MEDIUM, 25, "Lucas Ferraz",
        "O CEO pediu 18% de desconto para assinar antes do fim do trimestre. Está acima do "
        "padrão de 15% e precisa de revisão comercial. Alternativa na mesa: 12% com contrato "
        "de 2 anos.",
        discount="18",
    ),
    DemoDeal(
        "Hotel Brisa Mar", "Hotelaria", "Gestão de receita · 4 hotéis", "Comercial",
        Stage.CONTRACTS, "64000", Priority.LOW, 15, "Camila Duarte",
        "Venda adicional sobre o motor de reservas que já usam. Condições acertadas; falta o "
        "proprietário assinar o DPA (está viajando até sexta).",
    ),
    # Won
    DemoDeal(
        "Metalúrgica Forja Nobre", "Indústria", "Manutenção preditiva · 3 plantas", "Operações",
        Stage.CLOSED_WON, "420000", Priority.HIGH, -5, "Rafael Moura",
        "Contrato de 3 anos assinado depois de uma POC de 10 semanas que reduziu em 18% as "
        "paradas não planejadas. Kickoff no próximo mês; a planta 2 começa primeiro.",
        duration_months=36, payment_terms="Faturamento anual, 30 dias",
    ),
    DemoDeal(
        "Laboratório Precisa", "Diagnósticos", "Rastreamento de amostras", "TI",
        Stage.CLOSED_WON, "98000", Priority.MEDIUM, -12, "Juliana Prado",
        "Fechou depois que o laboratório foi reprovado numa auditoria de rastreabilidade de "
        "amostras. Ciclo rápido: 7 semanas do primeiro contato à assinatura.",
        discount="8",
    ),
    # Lost
    DemoDeal(
        "Agência Pixel Norte", "Mídia", "Relatórios de performance de campanhas", "Marketing",
        Stage.CLOSED_LOST, "35000", Priority.LOW, -10, "Lucas Ferraz",
        "Perdido para desenvolvimento interno: o time de dados já tinha metade dos painéis "
        "prontos. Retomar em 12 meses se a equipe mudar.",
    ),
    DemoDeal(
        "Expressa Cerrado Logística", "Logística", "Roteirização · 85 veículos", "Operações",
        Stage.CLOSED_LOST, "142000", Priority.MEDIUM, -20, "Camila Duarte",
        "Orçamento congelado no ano fiscal depois de uma queda no volume de fretes. O defensor "
        "do projeto continua interessado; retomar quando abrir o novo ciclo de orçamento, "
        "em janeiro.",
    ),
]

DEMO_RULES: list[dict] = [
    {
        "name": "DPA assinado antes de fechar",
        "description": "O deal só pode ser marcado como ganho com o DPA (LGPD) assinado.",
        "rule_type": RuleType.REQUIREMENT_DONE,
        "target_stage": Stage.CLOSED_WON,
        "severity": RuleSeverity.BLOCK,
        "params": {"requirement_kind": "dpa"},
    },
    {
        "name": "Questionário de segurança antes de Contratos",
        "description": "O deal só avança para Contratos depois que o questionário de segurança for respondido.",
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
        "description": "Contratos de valor alto exigem aprovação da diretoria registrada antes de fechar.",
        "rule_type": RuleType.APPROVAL_ABOVE_VALUE,
        "target_stage": Stage.CLOSED_WON,
        "severity": RuleSeverity.BLOCK,
        "params": {"min_value": 250000, "requirement_kind": "board_approval"},
    },
]

REQUIREMENT_LABELS = {
    "dpa": "DPA assinado (acordo de tratamento de dados)",
    "security_questionnaire": "Questionário de segurança respondido",
    "board_approval": "Aprovação da diretoria",
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
                duration_months=demo.duration_months,
                start_date=today + timedelta(days=max(demo.days_to_close, 0) + 15),
                payment_terms=demo.payment_terms,
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
