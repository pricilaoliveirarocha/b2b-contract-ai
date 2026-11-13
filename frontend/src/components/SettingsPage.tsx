import type { ReactNode } from 'react'
import { useI18n } from '../lib/i18nContext'
import { LOCALES, type MessageKey } from '../lib/messages'
import { HOME_PAGES, updatePreferences, usePreferences, type Density, type HomePage } from '../lib/preferences'

/** App preferences only (contract rules have their own page). Saved in this browser. */
export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n()
  const { homePage, density } = usePreferences()

  return (
    <main className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-8 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-xs text-muted">{t('set.saved')}</p>

        <Card title={t('set.language')} subtitle={t('set.languageSub')}>
          <Choices
            label={t('set.language')}
            value={locale}
            onChange={setLocale}
            options={LOCALES.map((option) => ({ value: option.id, title: option.name, lang: option.id }))}
          />
        </Card>

        <Card title={t('set.home')} subtitle={t('set.homeSub')}>
          <Choices<HomePage>
            label={t('set.home')}
            value={homePage}
            onChange={(value) => updatePreferences({ homePage: value })}
            options={HOME_PAGES.map((page) => ({ value: page, title: t(`nav.${page}`) }))}
            columns={3}
          />
        </Card>

        <Card title={t('set.density')} subtitle={t('set.densitySub')}>
          <Choices<Density>
            label={t('set.density')}
            value={density}
            onChange={(value) => updatePreferences({ density: value })}
            options={(['auto', 'compact'] as const).map((option) => ({
              value: option,
              title: t(`set.density.${option}` as MessageKey),
              hint: t(`set.density.${option}Hint` as MessageKey),
            }))}
          />
        </Card>

        <Card title={t('set.data')} subtitle={t('set.dataSub')}>
          <code className="block rounded-lg bg-ink px-3 py-2.5 text-[13px] text-white">python -m app.seed --reset</code>
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

interface ChoicesProps<T extends string> {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; title: string; hint?: string; lang?: string }[]
  columns?: 2 | 3
}

/** Single-choice group drawn as selectable cards. */
function Choices<T extends string>({ label, value, onChange, options, columns = 2 }: ChoicesProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`grid gap-2 ${columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={option.lang}
            onClick={() => onChange(option.value)}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
              selected ? 'border-primary bg-primary/[0.06]' : 'border-border hover:bg-background'
            }`}
          >
            <span
              className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 ${
                selected ? 'border-primary' : 'border-border'
              }`}
              aria-hidden="true"
            >
              {selected && <span className="size-2 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0">
              <span className={`block ${selected ? 'font-semibold' : 'font-medium'}`}>{option.title}</span>
              {option.hint && <span className="mt-0.5 block text-xs text-muted">{option.hint}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
