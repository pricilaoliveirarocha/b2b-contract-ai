"""Vocabulário do domínio: estágios do pipeline, prioridades e severidade de regras."""

from enum import StrEnum


class Stage(StrEnum):
    DISCOVERY = "discovery"
    BUSINESS_CASE = "business_case"
    POC = "poc"
    INFOSEC = "infosec"
    CONTRACTS = "contracts"
    CLOSED_WON = "closed_won"
    CLOSED_LOST = "closed_lost"


# Probabilidade padrão de fechamento por estágio (em %), como no pipeline do Notion.
STAGE_PROBABILITY: dict[Stage, int] = {
    Stage.DISCOVERY: 10,
    Stage.BUSINESS_CASE: 25,
    Stage.POC: 50,
    Stage.INFOSEC: 80,
    Stage.CONTRACTS: 90,
    Stage.CLOSED_WON: 100,
    Stage.CLOSED_LOST: 0,
}


class Priority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ContractStatus(StrEnum):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    SIGNED = "signed"


class RuleSeverity(StrEnum):
    BLOCK = "block"  # impede a mudança de estágio
    WARN = "warn"  # permite, mas gera aviso


class RuleType(StrEnum):
    REQUIREMENT_DONE = "requirement_done"  # um item do checklist precisa estar concluído
    MAX_DISCOUNT = "max_discount"  # desconto do contrato acima do limite
    APPROVAL_ABOVE_VALUE = "approval_above_value"  # valor alto exige aprovação


# Checklist items that deals carry today (see seed.py). Rules can only be satisfied by items that exist.
KNOWN_REQUIREMENT_KINDS = ("dpa", "security_questionnaire", "board_approval")
