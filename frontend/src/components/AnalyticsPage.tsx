import { useEffect, useState, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHART, fetchOverview, formatCompactMoney, type Overview } from '../lib/analytics'
import { formatMoney, type Stage } from '../lib/deals'
import { useI18n } from '../lib/i18nContext'
import { TREND_WEEKS, type TrendPoint } from '../lib/stats'
import { describeViolation } from '../lib/violations'
import InfoTip from './InfoTip'

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: Overview }

const OPEN_STAGES: Stage[] = ['discovery', 'business_case', 'poc', 'infosec', 'contracts']

/**
 * Dashboard in the spirit of a BI report: KPI tiles on top, then five panels.
 * Every panel says what it shows and has a "how to read" note.
 */
export default function AnalyticsPage({ trend }: { trend: TrendPoint[] | null }) {
  const { t, locale } = useI18n()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    fetchOverview()
      .then((data) => setState({ status: 'ready', data }))
      .catch(() => setState({ status: 'error' }))
  }, [])

  if (state.status !== 'ready') {
    return (
      <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
        <p
          className={`text-sm ${state.status === 'error' ? 'text-danger' : 'text-muted'}`}
          role={state.status === 'error' ? 'alert' : 'status'}
        >
          {t(state.status === 'error' ? 'an.error' : 'an.loading')}
        </p>
      </div>
    )
  }

  const data = state.data
  const money = (value: number) => formatMoney(value, locale)
  const compact = (value: number) => formatCompactMoney(value, locale)

  const funnel = OPEN_STAGES.map((stage) => {
    const bucket = data.by_stage.find((b) => b.key === stage)
    return { name: t(`stage.${stage}`), value: Number(bucket?.value ?? 0), count: bucket?.count ?? 0 }
  })
  const trendData = (trend ?? []).map((p) => ({
    name: new Date(p.date).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
    open: Number(p.open_value),
    weighted: Number(p.weighted_value),
  }))
  const owners = data.by_owner.map((o) => ({
    name: o.owner,
    open: Number(o.open_value),
    won: Number(o.won_value),
  }))
  const segments = data.by_segment.slice(0, 6).map((s) => ({ name: s.key, value: Number(s.value), count: s.count }))
  const maxBlocked = Math.max(1, ...data.rule_blockers.map((b) => Number(b.value)))

  return (
    // Fits the window on large screens (no page scroll); on small screens the dashboard scrolls inside.
    <main className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4 sm:px-6 lg:overflow-hidden">
      <div className="grid gap-3 lg:h-full lg:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label={t('stats.label')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label={t('an.winRate')}
            value={data.win_rate === null ? '—' : `${new Intl.NumberFormat(locale).format(data.win_rate)}%`}
            hint={t('an.winRateHint', { won: data.won_count, lost: data.lost_count })}
            accent="bg-primary"
          />
          <Kpi
            label={t('an.avgDeal')}
            value={data.avg_won_value === null ? '—' : money(Number(data.avg_won_value))}
            hint={t('an.avgDealHint')}
            accent="bg-win"
          />
          <Kpi
            label={t('an.cycle')}
            value={
              data.avg_cycle_days === null ? '—' : t('an.cycleValue', { days: Math.round(data.avg_cycle_days) })
            }
            hint={t('an.cycleHint')}
            accent="bg-violet"
          />
          <Kpi
            label={t('an.overdue')}
            value={String(data.overdue_count)}
            hint={t('an.overdueHint', { value: money(Number(data.overdue_value)) })}
            accent={data.overdue_count > 0 ? 'bg-danger' : 'bg-muted/40'}
          />
        </section>

        <div className="grid min-h-0 gap-3 lg:grid-cols-3">
          <Panel title={t('an.funnel')} subtitle={t('an.funnelSub')} info={t('an.funnelInfo')}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 4 }}>
                <CartesianGrid horizontal={false} stroke={CHART.grid} />
                <XAxis type="number" tickFormatter={compact} {...axisProps} />
                <YAxis type="category" dataKey="name" width={104} {...axisProps} />
                <Tooltip
                  cursor={{ fill: CHART.grid, opacity: 0.5 }}
                  content={(p) => (
                    <ChartTooltip
                      active={p.active}
                      label={p.label}
                      rows={(p.payload ?? []).map((item) => ({
                        color: CHART.primary,
                        name: t('an.dealsCount', { count: (item.payload as { count: number }).count }),
                        value: money(Number(item.value)),
                      }))}
                    />
                  )}
                />
                <Bar dataKey="value" fill={CHART.primary} radius={[0, 4, 4, 0]} barSize={18}>
                  <LabelList dataKey="value" position="right" formatter={(v) => compact(Number(v))} {...labelProps} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel
            title={t('an.trend')}
            subtitle={t('an.trendSub', { weeks: TREND_WEEKS })}
            info={t('an.trendInfo')}
            className="lg:col-span-2"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="fill-open" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={CHART.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fill-weighted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.secondary} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={CHART.secondary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis tickFormatter={compact} width={64} {...axisProps} />
                <Legend verticalAlign="top" align="right" height={24} iconType="plainline" wrapperStyle={legendStyle} />
                <Tooltip
                  cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }}
                  content={(p) => (
                    <ChartTooltip
                      active={p.active}
                      label={p.label}
                      rows={(p.payload ?? []).map((item) => ({
                        color: String(item.color),
                        name: String(item.name),
                        value: money(Number(item.value)),
                      }))}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="open"
                  name={t('stats.open')}
                  stroke={CHART.primary}
                  strokeWidth={2}
                  fill="url(#fill-open)"
                  activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="weighted"
                  name={t('stats.weighted')}
                  stroke={CHART.secondary}
                  strokeWidth={2}
                  fill="url(#fill-weighted)"
                  activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        <div className="grid min-h-0 gap-3 lg:grid-cols-3">
          <Panel title={t('an.owners')} subtitle={t('an.ownersSub')} info={t('an.ownersInfo')}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={owners} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 4 }} barGap={2}>
                <CartesianGrid horizontal={false} stroke={CHART.grid} />
                <XAxis type="number" tickFormatter={compact} {...axisProps} />
                <YAxis type="category" dataKey="name" width={96} {...axisProps} />
                <Legend verticalAlign="top" align="right" height={24} iconType="square" wrapperStyle={legendStyle} />
                <Tooltip
                  cursor={{ fill: CHART.grid, opacity: 0.5 }}
                  content={(p) => (
                    <ChartTooltip
                      active={p.active}
                      label={p.label}
                      rows={(p.payload ?? []).map((item) => ({
                        color: String(item.color),
                        name: String(item.name),
                        value: money(Number(item.value)),
                      }))}
                    />
                  )}
                />
                <Bar dataKey="open" name={t('stats.open')} fill={CHART.primary} radius={[0, 4, 4, 0]} barSize={9} />
                <Bar dataKey="won" name={t('stats.won')} fill={CHART.secondary} radius={[0, 4, 4, 0]} barSize={9} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title={t('an.segments')} subtitle={t('an.segmentsSub')} info={t('an.segmentsInfo')}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={segments} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 4 }}>
                <CartesianGrid horizontal={false} stroke={CHART.grid} />
                <XAxis type="number" tickFormatter={compact} {...axisProps} />
                <YAxis type="category" dataKey="name" width={112} {...axisProps} />
                <Tooltip
                  cursor={{ fill: CHART.grid, opacity: 0.5 }}
                  content={(p) => (
                    <ChartTooltip
                      active={p.active}
                      label={p.label}
                      rows={(p.payload ?? []).map((item) => ({
                        color: CHART.primary,
                        name: t('an.dealsCount', { count: (item.payload as { count: number }).count }),
                        value: money(Number(item.value)),
                      }))}
                    />
                  )}
                />
                <Bar dataKey="value" fill={CHART.primary} radius={[0, 4, 4, 0]} barSize={14}>
                  <LabelList dataKey="value" position="right" formatter={(v) => compact(Number(v))} {...labelProps} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title={t('an.blockers')} subtitle={t('an.blockersSub')} info={t('an.blockersInfo')}>
            {data.rule_blockers.length === 0 ? (
              <p className="grid h-full place-items-center text-sm text-muted">{t('an.blockersEmpty')}</p>
            ) : (
              <ul className="scroll-thin h-full space-y-3 overflow-y-auto pr-1">
                {data.rule_blockers.map((blocker) => {
                  const value = Number(blocker.value)
                  const isBlock = blocker.severity === 'block'
                  return (
                    <li key={blocker.rule_id}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] leading-snug font-medium">
                          {describeViolation({ ...blocker, message: blocker.rule_name }, t, locale)}
                        </p>
                        <span
                          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            isBlock ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'
                          }`}
                        >
                          {t(isBlock ? 'an.severity.block' : 'an.severity.warn')}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/70">
                          <div
                            className={`h-full rounded-full ${isBlock ? 'bg-danger' : 'bg-warning'}`}
                            style={{ width: `${(value / maxBlocked) * 100}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-xs text-muted">
                          {t('an.blockerDeals', { count: blocker.deals, value: compact(value) })}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </main>
  )
}

// Recessive axes: muted text, no lines.
const axisProps = {
  tick: { fill: CHART.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const
const labelProps = { fill: CHART.axis, fontSize: 11, fontWeight: 600 } as const
const legendStyle = { fontSize: 11, color: CHART.axis }

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint: string; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-surface px-4 py-3 shadow-[0_1px_3px_rgb(16_24_40/0.06)]">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} aria-hidden="true" />
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted">{hint}</p>
    </div>
  )
}

interface PanelProps {
  title: string
  subtitle: string
  info: string
  className?: string
  children: ReactNode
}

function Panel({ title, subtitle, info, className = '', children }: PanelProps) {
  const { t } = useI18n()
  return (
    <section
      className={`relative flex h-72 min-h-0 flex-col rounded-2xl border border-border/60 bg-surface p-4 shadow-[0_1px_3px_rgb(16_24_40/0.06)] lg:h-auto ${className}`}
    >
      <header className="mb-2 flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="truncate text-xs text-muted">{subtitle}</p>
        </div>
        <InfoTip label={t('an.howToRead')} title={title} text={info} />
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

interface ChartTooltipProps {
  active?: boolean
  label?: unknown
  rows: { color: string; name: string; value: string }[]
}

function ChartTooltip({ active, label, rows }: ChartTooltipProps) {
  if (!active || rows.length === 0) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{String(label)}</p>
      {rows.map((row) => (
        <p key={row.name} className="flex items-center gap-2">
          <span className="size-2 rounded-sm" style={{ background: row.color }} aria-hidden="true" />
          <span className="text-muted">{row.name}</span>
          <span className="ml-auto pl-3 font-semibold">{row.value}</span>
        </p>
      ))}
    </div>
  )
}
