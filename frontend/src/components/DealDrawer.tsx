import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  fetchDeal,
  formatFullDate,
  formatMoney,
  formatRelative,
  type DealDetail,
} from '../lib/deals'
import { useI18n } from '../lib/i18nContext'
import { isMessageKey } from '../lib/messages'
import StageBadge from './StageBadge'

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; deal: DealDetail }

/** Side panel with everything about one deal. Opens when `dealId` is set. */
export default function DealDrawer({ dealId, onClose }: { dealId: number | null; onClose: () => void }) {
  if (dealId === null) return null
  // `key` resets the panel's state when another deal is opened.
  return <DrawerPanel key={dealId} dealId={dealId} onClose={onClose} />
}

function DrawerPanel({ dealId, onClose }: { dealId: number; onClose: () => void }) {
  const { t, locale } = useI18n()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchDeal(dealId, controller.signal)
      .then((deal) => setState({ status: 'ready', deal }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error' })
        return error
      })
    return () => controller.abort()
  }, [dealId])

  // Focus the panel on open, close on Esc, and give focus back to where it was.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [onClose])

  const deal = state.status === 'ready' ? state.deal : null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="deal-drawer-title"
        className="relative flex h-full w-full max-w-md flex-col bg-surface shadow-2xl"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-muted">{deal?.company.name ?? ' '}</p>
            <h2 id="deal-drawer-title" className="mt-0.5 text-lg leading-snug font-bold tracking-tight">
              {deal?.title ?? t('drawer.loading')}
            </h2>
            {deal && (
              <div className="mt-2 flex items-center gap-3">
                <StageBadge stage={deal.stage} />
                <span className="text-base font-bold">
                  {formatMoney(Number(deal.value), locale, deal.currency)}
                </span>
              </div>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('drawer.close')}
            className="-m-1 grid size-9 shrink-0 place-items-center rounded-lg text-xl leading-none text-muted hover:bg-background hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
          >
            ×
          </button>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {state.status === 'loading' && (
            <p className="text-sm text-muted" role="status">
              {t('drawer.loading')}
            </p>
          )}
          {state.status === 'error' && (
            <p className="text-sm text-danger" role="alert">
              {t('drawer.error')}
            </p>
          )}

          {deal && (
            <div className="space-y-6">
              <Section title={t('drawer.details')}>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Field label={t('deals.col.owner')} value={deal.owner} />
                  <Field label={t('drawer.area')} value={deal.area} />
                  <Field label={t('deals.col.priority')} value={t(`priority.${deal.priority}`)} />
                  <Field
                    label={t('deals.col.close')}
                    value={deal.close_date && formatFullDate(deal.close_date, locale)}
                  />
                  <Field
                    label={t('deals.col.activity')}
                    value={deal.last_touched_at && formatRelative(deal.last_touched_at, locale)}
                  />
                </dl>
              </Section>

              <Section title={t('drawer.contract')}>
                {deal.contract ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <Field label={t('drawer.contractStatus')} value={t(`contract.${deal.contract.status}`)} />
                    <Field
                      label={t('drawer.total')}
                      value={formatMoney(Number(deal.contract.total_value), locale, deal.currency)}
                    />
                    <Field
                      label={t('drawer.duration')}
                      value={t('drawer.months', { count: deal.contract.duration_months })}
                    />
                    <Field
                      label={t('drawer.discount')}
                      value={`${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
                        Number(deal.contract.discount_percent),
                      )}%`}
                    />
                    <Field
                      label={t('drawer.start')}
                      value={deal.contract.start_date && formatFullDate(deal.contract.start_date, locale)}
                    />
                    <Field label={t('drawer.payment')} value={deal.contract.payment_terms} />
                  </dl>
                ) : (
                  <p className="text-sm text-muted">{t('drawer.noContract')}</p>
                )}
              </Section>

              <Section title={t('drawer.checklist')}>
                {deal.requirements.length === 0 ? (
                  <p className="text-sm text-muted">{t('drawer.noChecklist')}</p>
                ) : (
                  <ul className="space-y-2">
                    {deal.requirements.map((item) => {
                      const key = `requirement.${item.kind}`
                      return (
                        <li key={item.kind} className="flex items-center gap-2.5 text-sm">
                          <span
                            className={`grid size-5 shrink-0 place-items-center rounded-full ${
                              item.is_done ? 'bg-win text-white' : 'border-2 border-border'
                            }`}
                            aria-hidden="true"
                          >
                            {item.is_done && (
                              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            )}
                          </span>
                          <span className={item.is_done ? '' : 'text-muted'}>
                            {isMessageKey(key) ? t(key) : item.label}
                          </span>
                          <span className="sr-only">: {t(item.is_done ? 'drawer.done' : 'drawer.pending')}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Section>

              {deal.notes && (
                <Section title={t('drawer.notes')}>
                  <p className="rounded-xl bg-background px-3 py-2.5 text-sm leading-relaxed">{deal.notes}</p>
                </Section>
              )}

              <Section title={t('drawer.history')}>
                <ol className="relative space-y-3 border-l border-border pl-4">
                  {[...deal.stage_history].reverse().map((entry, index) => (
                    <li key={`${entry.changed_at}-${index}`} className="text-sm">
                      <span
                        className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-surface bg-primary"
                        aria-hidden="true"
                      />
                      <p>
                        {entry.from_stage
                          ? `${t(`stage.${entry.from_stage}`)} → ${t(`stage.${entry.to_stage}`)}`
                          : t('drawer.created', { stage: t(`stage.${entry.to_stage}`) })}
                      </p>
                      <p className="text-xs text-muted">{formatFullDate(entry.changed_at, locale)}</p>
                    </li>
                  ))}
                </ol>
              </Section>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-medium">{value || '—'}</dd>
    </div>
  )
}
