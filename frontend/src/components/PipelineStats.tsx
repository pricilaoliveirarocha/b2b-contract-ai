import type { ReactNode } from 'react'
import { formatMoney, isOpen, stageProbability, type Deal } from '../lib/deals'
import { useI18n } from '../lib/i18nContext'
import { percentChange, TREND_WEEKS, type TrendPoint } from '../lib/stats'
import Sparkline from './Sparkline'

interface PipelineStatsProps {
  deals: Deal[]
  trend: TrendPoint[] | null // null while loading or if the trend could not be fetched
}

export default function PipelineStats({ deals, trend }: PipelineStatsProps) {
  const { t, locale } = useI18n()
  const open = deals.filter((deal) => isOpen(deal.stage))
  const sum = (list: Deal[]) => list.reduce((total, deal) => total + Number(deal.value), 0)
  const current = {
    open: sum(open),
    weighted: open.reduce((total, d) => total + (Number(d.value) * stageProbability(d.stage)) / 100, 0),
    won: sum(deals.filter((deal) => deal.stage === 'closed_won')),
    count: open.length,
  }

  // History from the API, with today's live value as the last point so card and line always agree.
  const series = (pick: (point: TrendPoint) => number, live: number) =>
    trend ? [...trend.slice(0, -1).map(pick), live] : []

  const stats = [
    {
      label: t('stats.open'),
      value: formatMoney(current.open, locale),
      series: series((p) => Number(p.open_value), current.open),
      tone: 'blue' as const,
      icon: <path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5" />,
    },
    {
      label: t('stats.weighted'),
      value: formatMoney(current.weighted, locale),
      series: series((p) => Number(p.weighted_value), current.weighted),
      tone: 'violet' as const,
      icon: <path d="M4 20V11M10 20V5M16 20v-6M2 20h20" />,
    },
    {
      label: t('stats.won'),
      value: formatMoney(current.won, locale),
      series: series((p) => Number(p.won_value), current.won),
      tone: 'green' as const,
      icon: <path d="M20 6 9 17l-5-5" />,
    },
    {
      label: t('stats.openDeals'),
      value: String(current.count),
      series: series((p) => p.open_deals, current.count),
      tone: 'orange' as const,
      icon: (
        <>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </>
      ),
    },
  ]

  return (
    <dl
      aria-label={t('stats.label')}
      // `relative` keeps the sr-only trend text inside this scroll area (otherwise it widens the page).
      className="scroll-none relative -mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4"
    >
      {stats.map((stat) => (
        <StatCard key={stat.label} {...stat} vsLabel={t('stats.trendVs', { weeks: TREND_WEEKS })} />
      ))}
    </dl>
  )
}

const TONE = {
  blue: { icon: 'bg-primary', line: 'text-primary', tint: 'from-primary/[0.09]' },
  violet: { icon: 'bg-violet', line: 'text-violet', tint: 'from-violet/[0.10]' },
  green: { icon: 'bg-win', line: 'text-win', tint: 'from-win/[0.10]' },
  orange: { icon: 'bg-orange', line: 'text-orange', tint: 'from-orange/[0.11]' },
}

interface StatCardProps {
  label: string
  value: string
  series: number[]
  tone: keyof typeof TONE
  icon: ReactNode
  vsLabel: string
}

function StatCard({ label, value, series, tone, icon, vsLabel }: StatCardProps) {
  const change = percentChange(series)

  return (
    // Tinted card: the chart and the number are the focus; label and icon stay small.
    <div
      className={`flex w-64 shrink-0 snap-start items-end gap-3 rounded-2xl border border-border/60 bg-surface bg-linear-to-br to-surface to-70% px-3.5 pt-3 pb-2.5 shadow-[0_1px_3px_rgb(16_24_40/0.07)] transition-shadow duration-200 hover:shadow-md sm:w-auto ${TONE[tone].tint}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`grid size-5 shrink-0 place-items-center rounded-md text-white ${TONE[tone].icon}`}
            aria-hidden="true"
          >
            <svg
              className="size-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {icon}
            </svg>
          </span>
          <dt className="truncate text-xs font-medium text-muted">{label}</dt>
        </div>
        <dd className="mt-1 text-xl leading-tight font-bold tracking-tight">{value}</dd>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {change !== null && <TrendBadge change={change} vsLabel={vsLabel} />}
        <Sparkline values={series} className={`h-10 w-28 ${TONE[tone].line}`} />
      </div>
    </div>
  )
}

function TrendBadge({ change, vsLabel }: { change: number; vsLabel: string }) {
  const rounded = Math.round(change)
  const up = rounded > 0
  const down = rounded < 0
  const color = up ? 'bg-success/10 text-success' : down ? 'bg-danger/10 text-danger' : 'bg-muted/10 text-muted'
  const arrow = up ? '↑' : down ? '↓' : '→'

  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none font-semibold ${color}`} title={vsLabel}>
      <span aria-hidden="true">{arrow} </span>
      {Math.abs(rounded)}%<span className="sr-only"> {vsLabel}</span>
    </span>
  )
}
