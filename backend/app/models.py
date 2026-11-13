from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.domain import ContractStatus, Priority, RuleSeverity, RuleType, Stage


def _enum(enum_cls: type, name: str) -> Enum:
    # Guardado como texto (não enum nativo do Postgres) para facilitar evoluções.
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        validate_strings=True,
        values_callable=lambda e: [m.value for m in e],
        length=32,
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Company(TimestampMixin, Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    segment: Mapped[str | None] = mapped_column(String(100))

    deals: Mapped[list["Deal"]] = relationship(back_populates="company")


class Deal(TimestampMixin, Base):
    __tablename__ = "deals"
    __table_args__ = (
        CheckConstraint("value >= 0", name="ck_deals_value_non_negative"),
        Index("ix_deals_stage", "stage"),
        Index("ix_deals_close_date", "close_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="RESTRICT"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    area: Mapped[str | None] = mapped_column(String(100))  # ex.: GTM, R&D, Sales
    stage: Mapped[Stage] = mapped_column(_enum(Stage, "deal_stage"), default=Stage.DISCOVERY)
    value: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(3), default="BRL")
    priority: Mapped[Priority] = mapped_column(_enum(Priority, "deal_priority"), default=Priority.MEDIUM)
    close_date: Mapped[date | None] = mapped_column(Date)
    owner: Mapped[str | None] = mapped_column(String(120))
    last_touched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)

    company: Mapped[Company] = relationship(back_populates="deals")
    contract: Mapped["Contract | None"] = relationship(back_populates="deal", cascade="all, delete-orphan")
    requirements: Mapped[list["ContractRequirement"]] = relationship(
        back_populates="deal", cascade="all, delete-orphan"
    )
    stage_history: Mapped[list["StageHistory"]] = relationship(
        back_populates="deal", cascade="all, delete-orphan", order_by="StageHistory.changed_at"
    )


class Contract(TimestampMixin, Base):
    __tablename__ = "contracts"
    __table_args__ = (
        CheckConstraint("total_value >= 0", name="ck_contracts_total_value_non_negative"),
        CheckConstraint("duration_months > 0", name="ck_contracts_duration_positive"),
        CheckConstraint(
            "discount_percent >= 0 AND discount_percent <= 100", name="ck_contracts_discount_range"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), unique=True)
    status: Mapped[ContractStatus] = mapped_column(
        _enum(ContractStatus, "contract_status"), default=ContractStatus.DRAFT
    )
    total_value: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    duration_months: Mapped[int] = mapped_column(Integer)
    start_date: Mapped[date | None] = mapped_column(Date)
    payment_terms: Mapped[str | None] = mapped_column(String(200))
    discount_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))

    deal: Mapped[Deal] = relationship(back_populates="contract")


class ContractRequirement(TimestampMixin, Base):
    """Item do checklist de um deal (ex.: DPA assinado, questionário de segurança)."""

    __tablename__ = "contract_requirements"
    __table_args__ = (UniqueConstraint("deal_id", "kind", name="uq_requirements_deal_kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(64))  # identificador estável, ex.: "dpa"
    label: Mapped[str] = mapped_column(String(200))
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    deal: Mapped[Deal] = relationship(back_populates="requirements")


class Rule(TimestampMixin, Base):
    """Regra de contrato avaliada quando um deal tenta entrar em `target_stage`."""

    __tablename__ = "rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    rule_type: Mapped[RuleType] = mapped_column(_enum(RuleType, "rule_type"))
    target_stage: Mapped[Stage] = mapped_column(_enum(Stage, "rule_target_stage"), index=True)
    severity: Mapped[RuleSeverity] = mapped_column(_enum(RuleSeverity, "rule_severity"))
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class StageHistory(Base):
    """Auditoria de mudanças de estágio; alimenta o gráfico do funil."""

    __tablename__ = "stage_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), index=True)
    from_stage: Mapped[Stage | None] = mapped_column(_enum(Stage, "history_from_stage"))
    to_stage: Mapped[Stage] = mapped_column(_enum(Stage, "history_to_stage"))
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    changed_by: Mapped[str | None] = mapped_column(String(120))

    deal: Mapped[Deal] = relationship(back_populates="stage_history")
