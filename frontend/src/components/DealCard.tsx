import { formatDate, formatMoney, initials, isOverdue, type Deal, type Priority } from '../lib/deals'
import { useI18n } from '../lib/i18nContext'

const PRIORITY_DOT: Record<Priority, string> = {
  high: 'bg-danger',
  medium: 'bg-warning',
  low: 'bg-muted/40',
}

interface DealCardProps {
  deal: Deal
  isOverlay?: boolean
  dense?: boolean // one-line version used when a column is too full for regular cards
}

/**
 * Compact card (90-108px tall, depending on the title) so a column fits its deals without scrolling.
 * Secondary details (priority name, owner name, "overdue") are in tooltips and screen-reader text.
 */
export default function DealCard({ deal, isOverlay = false, dense = false }: DealCardProps) {
  const { t, locale } = useI18n()
  const overdue = isOverdue(deal)
  const priority = t(`priority.${deal.priority}`)
  const value = formatMoney(Number(deal.value), locale, deal.currency)

  if (dense) {
    return (
      <article
        className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface px-2.5 py-2 shadow-[0_1px_2px_rgb(16_24_40/0.05)] transition-shadow duration-150 hover:shadow-md"
        title={`${deal.title}${deal.owner ? ` · ${deal.owner}` : ''}`}
      >
        <span className={`size-2 shrink-0 rounded-full ${PRIORITY_DOT[deal.priority]}`}>
          <span className="sr-only">
            {priority} {t('card.priority')}
          </span>
        </span>
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold">
          {deal.company.name}
          <span className="sr-only"> — {deal.title}</span>
        </h3>
        <span className="shrink-0 text-xs font-bold">{value}</span>
      </article>
    )
  }

  return (
    <article
      className={`rounded-xl border border-border/60 bg-surface px-3 py-2.5 transition-shadow duration-150 ${
        isOverlay ? 'rotate-1 cursor-grabbing shadow-xl' : 'shadow-[0_1px_2px_rgb(16_24_40/0.05)] hover:shadow-md'
      }`}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
        <span className="truncate" title={deal.company.name}>
          {deal.company.name}
        </span>
        {deal.close_date && (
          <span
            className={`shrink-0 ${overdue ? 'font-semibold text-danger' : ''}`}
            title={overdue ? t('card.overdue') : undefined}
          >
            {overdue && <span className="sr-only">{t('card.overdue')}: </span>}
            {formatDate(deal.close_date, locale)}
          </span>
        )}
      </div>

      <h3 className="mt-0.5 line-clamp-2 text-[13px] leading-snug font-semibold" title={deal.title}>
        {deal.title}
      </h3>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-bold tracking-tight">
          {value}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`size-2 rounded-full ${PRIORITY_DOT[deal.priority]}`}
            title={`${priority} ${t('card.priority')}`}
          >
            <span className="sr-only">
              {priority} {t('card.priority')}
            </span>
          </span>
          {deal.owner && (
            <span
              className="grid size-6 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
              title={deal.owner}
            >
              <span aria-hidden="true">{initials(deal.owner)}</span>
              <span className="sr-only">{deal.owner}</span>
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
