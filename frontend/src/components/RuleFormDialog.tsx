import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { formatMoney, STAGES, type Stage } from '../lib/deals'
import { useI18n } from '../lib/i18nContext'
import { requirementLabel } from '../lib/ruleText'
import {
  KNOWN_REQUIREMENTS,
  PARAMS_BY_TYPE,
  RULE_TYPES,
  type Rule,
  type RuleDraft,
  type RuleInput,
  type RuleType,
  type Severity,
} from '../lib/rules'
import { STAGE_THEME } from '../lib/stageTheme'
import Modal from './Modal'
import SparkIcon from './SparkIcon'
import Switch from './Switch'

interface RuleFormDialogProps {
  rule: Rule | null // null = creating a new rule
  draft?: RuleDraft | null // a rule proposed by the AI, to review before saving
  onSubmit: (input: RuleInput, ruleType: RuleType) => Promise<void> // throws if the server refuses
  onClose: () => void
}

const FORM_ID = 'rule-form'
const INPUT =
  'block h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-2 focus:outline-primary/20 disabled:cursor-not-allowed disabled:bg-background disabled:text-muted'

const TYPE_ICON: Record<RuleType, string> = {
  requirement_done: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9',
  max_discount: 'M19 5 5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  approval_above_value: 'M12 3 5 6v5c0 4.5 2.9 8.3 7 10 4.1-1.7 7-5.5 7-10V6l-7-3ZM9 12l2 2 4-4',
}

/**
 * Create or edit a rule. The rule type is picked from cards, the stage from colored chips, and a
 * sentence at the bottom always says in plain words what the rule will do.
 */
export default function RuleFormDialog({ rule, draft, onSubmit, onClose }: RuleFormDialogProps) {
  const { t, locale } = useI18n()
  const editing = rule !== null
  const [initial] = useState(() => initialValues(rule, draft))
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [ruleType, setRuleType] = useState<RuleType>(initial.ruleType)
  const [stage, setStage] = useState<Stage>(initial.stage)
  const [severity, setSeverity] = useState<Severity>(initial.severity)
  const [active, setActive] = useState(initial.active)
  const [requirement, setRequirement] = useState(initial.requirement)
  const [requirementPicked, setRequirementPicked] = useState(false) // true once the person chose an item
  const [maxPercent, setMaxPercent] = useState(initial.maxPercent)
  const [minValue, setMinValue] = useState(initial.minValue)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const uses = PARAMS_BY_TYPE[ruleType]
  // A rule saved earlier might point at an item this form doesn't list: keep it selectable.
  const requirements = KNOWN_REQUIREMENTS.includes(requirement as (typeof KNOWN_REQUIREMENTS)[number])
    ? [...KNOWN_REQUIREMENTS]
    : [requirement, ...KNOWN_REQUIREMENTS]

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFailed(false)
    const input: RuleInput = {
      name: name.trim(),
      description: description.trim(),
      target_stage: stage,
      severity,
      is_active: active,
      ...(uses.requirement && { requirement_kind: requirement }),
      ...(uses.maxPercent && { max_percent: maxPercent }),
      ...(uses.minValue && { min_value: minValue }),
    }
    try {
      await onSubmit(input, ruleType)
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }

  const sentence = t(`rules.preview.${ruleType}.${severity}`, {
    stage: t(`stage.${stage}`),
    item: requirementLabel(requirement, t),
    percent: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(maxPercent) || 0),
    value: formatMoney(Number(minValue) || 0, locale),
  })

  return (
    <Modal
      wide
      title={t(editing ? 'rules.form.editTitle' : 'rules.form.createTitle')}
      onClose={onClose}
      summary={
        <p className="border-l-2 border-primary pl-3 text-[13px] leading-relaxed text-ink/80">
          <span className="sr-only">{t('rules.form.summary')}: </span>
          {sentence}
        </p>
      }
      footer={
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-xs font-medium text-danger" role="alert">
            {failed && t('rules.form.error')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg px-4 text-sm font-medium text-muted hover:bg-background hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
          >
            {t('rules.form.cancel')}
          </button>
          <button
            type="submit"
            form={FORM_ID}
            disabled={saving}
            className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60"
          >
            {t(saving ? 'rules.form.saving' : 'rules.form.save')}
          </button>
        </div>
      }
    >
      {draft && (
        <div className="mb-5 rounded-xl bg-violet/[0.08] px-3.5 py-2.5">
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <SparkIcon className="size-4 shrink-0 text-violet" />
            {t('rules.ai.draftBanner')}
          </p>
          {draft.explanation && <p className="mt-1 text-xs leading-relaxed text-ink/80">{draft.explanation}</p>}
        </div>
      )}

      <form id={FORM_ID} onSubmit={submit} className="space-y-5">
        <Field label={t('rules.form.name')}>
          {(id) => (
            <input
              id={id}
              required
              minLength={3}
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('rules.form.namePlaceholder')}
              className={INPUT}
            />
          )}
        </Field>

        <Field label={t('rules.form.description')}>
          {(id) => (
            <textarea
              id={id}
              rows={2}
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={`${INPUT} h-auto resize-none py-2 leading-relaxed`}
            />
          )}
        </Field>

        <Group label={t('rules.form.typeShort')} hint={editing ? t('rules.form.typeLocked') : t(`rules.typeHint.${ruleType}`)}>
          <div role="radiogroup" aria-label={t('rules.form.type')} className="grid gap-2 sm:grid-cols-3">
            {RULE_TYPES.map((type) => {
              const selected = type === ruleType
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={editing}
                  onClick={() => {
                    setRuleType(type)
                    // Until an item is chosen, suggest the one that fits the type (approvals use the board's).
                    if (!requirementPicked && !draft) setRequirement(type === 'approval_above_value' ? 'board_approval' : 'dpa')
                  }}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed ${
                    selected ? 'border-primary bg-primary/[0.06]' : 'border-border hover:bg-background disabled:opacity-45 disabled:hover:bg-transparent'
                  }`}
                >
                  <svg
                    className={`size-[18px] shrink-0 ${selected ? 'text-primary' : 'text-muted'}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={TYPE_ICON[type]} />
                  </svg>
                  {t(`rules.type.${type}`)}
                </button>
              )
            })}
          </div>
        </Group>

        <Group label={t('rules.form.stage')}>
          <div role="radiogroup" aria-label={t('rules.form.stage')} className="flex flex-wrap gap-1.5">
            {STAGES.map((option) => {
              const selected = option.id === stage
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setStage(option.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
                    selected ? 'border-primary bg-primary/[0.06] font-semibold' : 'border-border text-ink/80 hover:bg-background'
                  }`}
                >
                  <span className={`size-1.5 rounded-full bg-current ${STAGE_THEME[option.id].color}`} aria-hidden="true" />
                  {t(`stage.${option.id}`)}
                </button>
              )
            })}
          </div>
        </Group>

        {(uses.maxPercent || uses.minValue || uses.requirement) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {uses.maxPercent && (
              <Field label={t('rules.form.maxPercent')}>
                {(id) => (
                  <div className="relative">
                    <input
                      id={id}
                      type="number"
                      inputMode="decimal"
                      required
                      min={0}
                      max={100}
                      step={0.5}
                      value={maxPercent}
                      onChange={(event) => setMaxPercent(event.target.value)}
                      className={`${INPUT} pr-8`}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted" aria-hidden="true">
                      %
                    </span>
                  </div>
                )}
              </Field>
            )}

            {uses.minValue && (
              <Field label={t('rules.form.minValue')}>
                {(id) => (
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted" aria-hidden="true">
                      R$
                    </span>
                    <input
                      id={id}
                      type="number"
                      inputMode="decimal"
                      required
                      min={0}
                      max={1_000_000_000}
                      step={1000}
                      value={minValue}
                      onChange={(event) => setMinValue(event.target.value)}
                      className={`${INPUT} pl-9`}
                    />
                  </div>
                )}
              </Field>
            )}

            {uses.requirement && (
              <Field label={t('rules.form.requirement')}>
                {(id) => (
                  <Select
                    id={id}
                    value={requirement}
                    onChange={(value) => {
                      setRequirement(value)
                      setRequirementPicked(true)
                    }}
                  >
                    {requirements.map((kind) => (
                      <option key={kind} value={kind}>
                        {requirementLabel(kind, t)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </div>
        )}

        <Group label={t('rules.form.severity')}>
          <div role="radiogroup" aria-label={t('rules.form.severity')} className="grid gap-2 sm:grid-cols-2">
            {(['block', 'warn'] as const).map((option) => {
              const selected = severity === option
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSeverity(option)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
                    selected
                      ? option === 'block'
                        ? 'border-danger bg-danger/[0.06]'
                        : 'border-warning bg-warning/[0.06]'
                      : 'border-border hover:bg-background'
                  }`}
                >
                  <span className="flex items-center gap-2 text-[13px] font-semibold">
                    <span className={`size-2 rounded-full ${option === 'block' ? 'bg-danger' : 'bg-warning'}`} aria-hidden="true" />
                    {t(`rules.form.${option}`)}
                  </span>
                  <span className="mt-0.5 block pl-4 text-xs text-muted">{t(`rules.form.${option}Hint`)}</span>
                </button>
              )
            })}
          </div>
        </Group>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-background px-3.5 py-2.5">
          <span className="text-[13px] font-semibold">{t('rules.form.active')}</span>
          <Switch
            checked={active}
            label={t('rules.form.active')}
            onText={t('rules.active')}
            offText={t('rules.inactive')}
            onChange={setActive}
          />
        </div>
      </form>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

/** A labelled set of options (cards or chips) that has no single input to point a <label> at. */
function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold">{label}</p>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

interface SelectProps {
  id: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}

function Select({ id, value, onChange, children }: SelectProps) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${INPUT} cursor-pointer appearance-none pr-9`}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  )
}

function initialValues(rule: Rule | null, draft: RuleDraft | null | undefined) {
  if (rule) {
    return {
      name: rule.name,
      description: rule.description ?? '',
      ruleType: rule.rule_type,
      stage: rule.target_stage,
      severity: rule.severity,
      active: rule.is_active,
      requirement: String(rule.params.requirement_kind ?? 'dpa'),
      maxPercent: String(rule.params.max_percent ?? '15'),
      minValue: String(rule.params.min_value ?? '250000'),
    }
  }
  const proposed = draft?.rule
  return {
    name: proposed?.name ?? '',
    description: proposed?.description ?? '',
    ruleType: proposed?.rule_type ?? ('requirement_done' as RuleType),
    stage: proposed?.target_stage ?? ('contracts' as Stage),
    severity: proposed?.severity ?? ('block' as Severity),
    active: proposed?.is_active ?? true,
    requirement: proposed?.requirement_kind ?? 'dpa',
    maxPercent: proposed?.max_percent ?? '15',
    minValue: proposed?.min_value ?? '250000',
  }
}
