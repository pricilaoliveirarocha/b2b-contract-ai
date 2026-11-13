import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { fetchRules, updateRule, type Rule, type RuleUpdate } from '../lib/analytics'
import { useI18n } from '../lib/i18nContext'
import { LOCALES } from '../lib/messages'
import StageBadge from './StageBadge'

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; rules: Rule[] }

/** Language, contract rules (on/off and thresholds) and where the sample data comes from. */
export default function SettingsPage() {
  const { t } = useI18n()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    fetchRules()
      .then((rules) => setState({ status: 'ready', rules }))
      .catch(() => setState({ status: 'error' }))
  }, [])

  function replaceRule(updated: Rule) {
    setState((current) =>
      current.status === 'ready'
        ? { status: 'ready', rules: current.rules.map((r) => (r.id === updated.id ? updated : r)) }
        : current,
    )
  }

  return (
    <main className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-8 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <Card title={t('set.language')} subtitle={t('set.languageSub')}>
          <LanguagePicker />
        </Card>

        <Card title={t('set.rules')} subtitle={t('set.rulesSub')}>
          {state.status === 'loading' && (
            <p className="text-sm text-muted" role="status">
              {t('set.loading')}
            </p>
          )}
          {state.status === 'error' && (
            <p className="text-sm text-danger" role="alert">
              {t('set.error')}
            </p>
          )}
          {state.status === 'ready' && (
            <ul className="divide-y divide-border/70">
              {state.rules.map((rule) => (
                <li key={rule.id} className="py-4 first:pt-1 last:pb-1">
                  <RuleRow rule={rule} onSaved={replaceRule} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t('set.data')} subtitle={t('set.dataSub')}>
          <code className="block rounded-lg bg-ink px-3 py-2.5 text-[13px] text-white">
            python -m app.seed --reset
          </code>
        </Card>
      </div>
    </main>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-surface p-5 shadow-[0_1px_3px_rgb(16_24_40/0.06)]">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">{subtitle}</p>
      {children}
    </section>
  )
}

function LanguagePicker() {
  const { t, locale, setLocale } = useI18n()
  return (
    <div role="radiogroup" aria-label={t('set.language')} className="grid gap-2 sm:grid-cols-2">
      {LOCALES.map((option) => {
        const selected = option.id === locale
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={option.id}
            onClick={() => setLocale(option.id)}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
              selected ? 'border-primary bg-primary/[0.06] font-semibold' : 'border-border hover:bg-background'
            }`}
          >
            <span
              className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${
                selected ? 'border-primary' : 'border-border'
              }`}
              aria-hidden="true"
            >
              {selected && <span className="size-2 rounded-full bg-primary" />}
            </span>
            {option.name}
          </button>
        )
      })}
    </div>
  )
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function RuleRow({ rule, onSaved }: { rule: Rule; onSaved: (rule: Rule) => void }) {
  const { t, locale } = useI18n()
  const threshold =
    rule.rule_type === 'max_discount'
      ? { field: 'max_percent' as const, label: t('set.maxPercent'), max: 100, step: 0.5 }
      : rule.rule_type === 'approval_above_value'
        ? { field: 'min_value' as const, label: t('set.minValue'), max: 1_000_000_000, step: 1000 }
        : null
  const [value, setValue] = useState(threshold ? String(rule.params[threshold.field] ?? '') : '')
  const [save, setSave] = useState<SaveState>('idle')
  const isBlock = rule.severity === 'block'

  async function apply(changes: RuleUpdate) {
    setSave('saving')
    try {
      onSaved(await updateRule(rule.id, changes))
      setSave('saved')
    } catch {
      setSave('error')
    }
  }

  function submitThreshold(event: FormEvent) {
    event.preventDefault()
    if (threshold) void apply({ [threshold.field]: value })
  }

  const unchanged = threshold !== null && String(rule.params[threshold.field]) === value

  return (
    <div className={rule.is_active ? '' : 'opacity-60'}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{rule.name}</h3>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                isBlock ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'
              }`}
            >
              {t(isBlock ? 'an.severity.block' : 'an.severity.warn')}
            </span>
          </div>
          {rule.description && <p className="mt-0.5 text-sm text-muted">{rule.description}</p>}
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
            {t('set.appliesTo')} <StageBadge stage={rule.target_stage} />
          </p>
        </div>
        <Switch
          checked={rule.is_active}
          label={t('set.toggle', { name: rule.name })}
          disabled={save === 'saving'}
          onChange={(checked) => void apply({ is_active: checked })}
        />
      </div>

      {threshold && (
        <form onSubmit={submitThreshold} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-muted">
            {threshold.label}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={threshold.max}
              step={threshold.step}
              required
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setSave('idle')
              }}
              className="mt-1 block h-10 w-44 rounded-lg border border-border bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-2 focus:outline-primary/20"
            />
          </label>
          <button
            type="submit"
            disabled={unchanged || save === 'saving'}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t(save === 'saving' ? 'set.saving' : 'set.save')}
          </button>
          {threshold.field === 'min_value' && value && (
            <span className="pb-2.5 text-xs text-muted">
              = {new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(value))}
            </span>
          )}
        </form>
      )}

      <p className="mt-2 min-h-4 text-xs" role="status">
        {save === 'saved' && <span className="font-medium text-success">✓ {t('set.saved')}</span>}
        {save === 'error' && <span className="text-danger">{t('set.saveError')}</span>}
      </p>
    </div>
  )
}

interface SwitchProps {
  checked: boolean
  label: string
  disabled?: boolean
  onChange: (checked: boolean) => void
}

function Switch({ checked, label, disabled, onChange }: SwitchProps) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex shrink-0 items-center gap-2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait"
    >
      <span className="text-xs font-medium text-muted">{t(checked ? 'set.active' : 'set.inactive')}</span>
      <span
        className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${checked ? 'bg-primary' : 'bg-border'}`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </span>
    </button>
  )
}
