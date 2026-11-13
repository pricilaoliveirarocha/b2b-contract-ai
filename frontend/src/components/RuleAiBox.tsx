import type { FormEvent } from 'react'
import { useI18n } from '../lib/i18nContext'
import SparkIcon from './SparkIcon'

interface RuleAiBoxProps {
  isAdmin: boolean
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  busy: boolean
  error: string | null
}

/** One line: describe a rule in plain language. The AI proposes a draft that opens for review. */
export default function RuleAiBox({ isAdmin, value, onChange, onSubmit, busy, error }: RuleAiBoxProps) {
  const { t } = useI18n()
  const canSubmit = isAdmin && !busy && value.trim().length > 0

  function submit(event: FormEvent) {
    event.preventDefault()
    if (canSubmit) onSubmit()
  }

  return (
    <div>
      <form
        onSubmit={submit}
        title={t('rules.ai.disclaimer')}
        className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 transition-colors duration-150 focus-within:border-violet/60 focus-within:ring-2 focus-within:ring-violet/15"
      >
        <SparkIcon className={`size-4 shrink-0 text-violet ${busy ? 'animate-pulse' : ''}`} />
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t('rules.ai.title')}</span>
          <input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={!isAdmin || busy}
            maxLength={500}
            placeholder={isAdmin ? t('rules.ai.placeholder') : t('rules.ai.signIn')}
            className="block h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted disabled:cursor-not-allowed"
          />
        </label>
        <button
          type="submit"
          disabled={!canSubmit}
          className="h-8 shrink-0 rounded-lg px-3 text-sm font-semibold text-violet transition-colors duration-150 hover:bg-violet/10 focus-visible:outline-2 focus-visible:outline-violet disabled:cursor-not-allowed disabled:text-muted/60 disabled:hover:bg-transparent"
        >
          {t(busy ? 'rules.ai.generating' : 'rules.ai.generate')}
        </button>
      </form>
      {error && (
        <p className="mt-1.5 px-1 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
