import { useMemo, useState, type ReactNode } from 'react'
import {
  formatDate,
  formatMoney,
  formatRelative,
  initials,
  isOverdue,
  STAGES,
  type Deal,
  type Priority,
  type Stage,
} from '../lib/deals'
import { useI18n } from '../lib/i18nContext'
import type { MessageKey } from '../lib/messages'
import DealDrawer from './DealDrawer'
import StageBadge from './StageBadge'

type SortKey = 'deal' | 'stage' | 'value' | 'priority' | 'close' | 'activity'
type SortDir = 'asc' | 'desc'

const PRIORITY_RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 }
const PRIORITY_DOT: Record<Priority, string> = { high: 'bg-danger', medium: 'bg-warning', low: 'bg-muted/40' }
const STAGE_RANK = Object.fromEntries(STAGES.map((stage, index) => [stage.id, index])) as Record<Stage, number>

// Values used to sort each column. Missing dates go last.
const SORT_VALUE: Record<SortKey, (deal: Deal) => number | string> = {
  deal: (d) => d.company.name.toLowerCase(),
  stage: (d) => STAGE_RANK[d.stage],
  value: (d) => Number(d.value),
  priority: (d) => PRIORITY_RANK[d.priority],
  close: (d) => d.close_date ?? '9999-12-31',
  activity: (d) => d.last_touched_at ?? '',
}

interface DealsPageProps {
  deals: Deal[]
  /** Moves the deals to a stage; resolves with the ids that did NOT move (blocked by a rule, etc.). */
  onBulkMove: (dealIds: number[], stage: Stage) => Promise<number[]>
}

/**
 * Every deal in a sortable, filterable table. Clicking a row opens its details; the checkboxes
 * select several deals to move them to another stage in one go.
 */
export default function DealsPage({ deals, onBulkMove }: DealsPageProps) {
  const { t, locale } = useI18n()
  const [stage, setStage] = useState<Stage | 'all'>('all')
  const [owner, setOwner] = useState('all')
  const [priority, setPriority] = useState<Priority | 'all'>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'close', dir: 'asc' })
  const [openId, setOpenId] = useState<number | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [target, setTarget] = useState<Stage | 'all'>('all') // 'all' = no stage chosen yet
  const [moving, setMoving] = useState(false)

  const owners = useMemo(
    () => [...new Set(deals.map((d) => d.owner).filter((o): o is string => Boolean(o)))].sort(),
    [deals],
  )

  const rows = useMemo(() => {
    const filtered = deals.filter(
      (d) =>
        (stage === 'all' || d.stage === stage) &&
        (owner === 'all' || d.owner === owner) &&
        (priority === 'all' || d.priority === priority),
    )
    const pick = SORT_VALUE[sort.key]
    const factor = sort.dir === 'asc' ? 1 : -1
    return filtered.sort((a, b) => (pick(a) < pick(b) ? -factor : pick(a) > pick(b) ? factor : 0))
  }, [deals, stage, owner, priority, sort])

  const total = rows.reduce((sum, d) => sum + Number(d.value), 0)
  // Only what is on screen counts: a deal hidden by a filter is never moved by accident.
  const selectedRows = rows.filter((d) => selected.has(d.id))
  const allSelected = rows.length > 0 && selectedRows.length === rows.length
  const hasFilters = stage !== 'all' || owner !== 'all' || priority !== 'all'

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'value' || key === 'priority' || key === 'activity' ? 'desc' : 'asc' },
    )
  }

  /** Replaces the selection. An empty one also forgets the chosen stage, so a new selection starts clean. */
  function select(ids: Iterable<number>) {
    const next = new Set(ids)
    setSelected(next)
    if (next.size === 0) setTarget('all')
  }

  function toggleOne(id: number) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    select(next)
  }

  function toggleAll() {
    select(allSelected ? [] : rows.map((d) => d.id))
  }

  async function applyBulk() {
    if (target === 'all' || selectedRows.length === 0) return
    setMoving(true)
    const notMoved = await onBulkMove(
      selectedRows.map((d) => d.id),
      target,
    )
    setMoving(false)
    // What moved leaves the selection; what a rule blocked stays selected so it is easy to fix and retry.
    select(notMoved)
  }

  function clearFilters() {
    setStage('all')
    setOwner('all')
    setPriority('all')
  }

  const header = (key: SortKey, label: MessageKey, className = '') => (
    <SortHeader label={t(label)} active={sort.key === key} dir={sort.dir} onClick={() => toggleSort(key)} className={className} />
  )

  return (
    <main className="flex min-h-0 flex-1 flex-col px-4 pt-3 pb-4 sm:px-6">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <FilterSelect label={t('deals.stageFilter')} value={stage} onChange={(v) => setStage(v as Stage | 'all')}>
          <option value="all">{t('deals.allStages')}</option>
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {t(`stage.${s.id}`)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label={t('deals.ownerFilter')} value={owner} onChange={setOwner}>
          <option value="all">{t('deals.allOwners')}</option>
          {owners.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label={t('deals.priorityFilter')}
          value={priority}
          onChange={(v) => setPriority(v as Priority | 'all')}
        >
          <option value="all">{t('deals.allPriorities')}</option>
          {(['high', 'medium', 'low'] as const).map((p) => (
            <option key={p} value={p}>
              {t(`priority.${p}`)}
            </option>
          ))}
        </FilterSelect>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="h-9 rounded-lg px-2 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          >
            {t('deals.clearFilters')}
          </button>
        )}
        <p className="ml-auto text-sm text-muted" role="status">
          {t('deals.summary', { count: rows.length, total: formatMoney(total, locale) })}
        </p>
      </div>

      {selectedRows.length > 0 && (
        <div
          role="region"
          aria-label={t('deals.bulk.label')}
          className="mb-3 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-primary/[0.07] px-3.5 py-2"
        >
          <p className="text-sm font-semibold" role="status">
            {selectedRows.length === 1 ? t('deals.bulk.countOne') : t('deals.bulk.count', { count: selectedRows.length })}
          </p>
          <span className="text-sm text-muted" aria-hidden="true">
            {t('deals.bulk.moveTo')}
          </span>
          <FilterSelect label={t('deals.bulk.moveTo')} value={target} onChange={(v) => setTarget(v as Stage | 'all')}>
            <option value="all">{t('deals.bulk.choose')}</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {t(`stage.${s.id}`)}
              </option>
            ))}
          </FilterSelect>
          <button
            type="button"
            onClick={() => void applyBulk()}
            disabled={target === 'all' || moving}
            className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-xs hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t(moving ? 'deals.bulk.applying' : 'deals.bulk.apply')}
          </button>
          <button
            type="button"
            onClick={() => select([])}
            disabled={moving}
            className="ml-auto h-9 rounded-lg px-2 text-sm font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
          >
            {t('deals.bulk.clear')}
          </button>
        </div>
      )}

      {/* The table scrolls inside its card; the page itself stays fixed. */}
      <div className="scroll-thin relative min-h-0 flex-1 overflow-auto rounded-2xl border border-border/70 bg-surface shadow-[0_1px_3px_rgb(16_24_40/0.06)]">
        {rows.length === 0 ? (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-muted">
            <p>
              {t('deals.empty')}{' '}
              {hasFilters && (
                <button type="button" onClick={clearFilters} className="font-medium text-primary hover:underline">
                  {t('deals.clearFilters')}
                </button>
              )}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface/95 text-left text-xs text-muted backdrop-blur">
              <tr className="border-b border-border">
                <th scope="col" className="w-10 py-2.5 pr-0 pl-4">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(box) => {
                      if (box) box.indeterminate = selectedRows.length > 0 && !allSelected
                    }}
                    onChange={toggleAll}
                    aria-label={t('deals.select.all', { count: rows.length })}
                    className="size-4 cursor-pointer accent-primary"
                  />
                </th>
                {header('deal', 'deals.col.deal', 'pl-2')}
                {header('stage', 'deals.col.stage')}
                {header('value', 'deals.col.value', 'text-right')}
                {header('priority', 'deals.col.priority', 'hidden md:table-cell')}
                <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">
                  {t('deals.col.owner')}
                </th>
                {header('close', 'deals.col.close', 'hidden sm:table-cell')}
                {header('activity', 'deals.col.activity', 'hidden pr-4 xl:table-cell')}
              </tr>
            </thead>
            <tbody>
              {rows.map((deal) => {
                const overdue = isOverdue(deal)
                return (
                  <tr
                    key={deal.id}
                    onClick={() => setOpenId(deal.id)}
                    className={`cursor-pointer border-b border-border/60 transition-colors duration-150 last:border-0 hover:bg-background ${
                      selected.has(deal.id) ? 'bg-primary/[0.05]' : ''
                    }`}
                  >
                    <td className="w-10 py-2.5 pr-0 pl-4" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(deal.id)}
                        onChange={() => toggleOne(deal.id)}
                        aria-label={t('deals.select.one', { title: deal.title })}
                        className="size-4 cursor-pointer accent-primary"
                      />
                    </td>
                    <td className="py-2.5 pr-3 pl-2">
                      {/* A real button so the row works with the keyboard too. */}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setOpenId(deal.id)
                        }}
                        aria-label={t('deals.open', { title: deal.title })}
                        className="block w-56 max-w-full rounded text-left focus-visible:outline-2 focus-visible:outline-primary sm:w-64 lg:w-72"
                      >
                        <span className="block truncate font-semibold">{deal.title}</span>
                        <span className="block truncate text-xs text-muted">{deal.company.name}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <StageBadge stage={deal.stage} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                      {formatMoney(Number(deal.value), locale, deal.currency)}
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                        <span className={`size-2 rounded-full ${PRIORITY_DOT[deal.priority]}`} aria-hidden="true" />
                        {t(`priority.${deal.priority}`)}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 lg:table-cell">
                      {deal.owner && (
                        <span className="inline-flex items-center gap-2 text-xs whitespace-nowrap">
                          <span
                            className="grid size-6 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
                            aria-hidden="true"
                          >
                            {initials(deal.owner)}
                          </span>
                          {deal.owner}
                        </span>
                      )}
                    </td>
                    <td
                      className={`hidden px-3 py-2.5 text-xs whitespace-nowrap sm:table-cell ${
                        overdue ? 'font-semibold text-danger' : 'text-muted'
                      }`}
                    >
                      {deal.close_date && formatDate(deal.close_date, locale)}
                      {overdue && <span className="sr-only"> ({t('card.overdue')})</span>}
                    </td>
                    <td className="hidden py-2.5 pr-4 pl-3 text-xs whitespace-nowrap text-muted xl:table-cell">
                      {deal.last_touched_at && formatRelative(deal.last_touched_at, locale)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <DealDrawer dealId={openId} onClose={() => setOpenId(null)} />
    </main>
  )
}

interface SortHeaderProps {
  label: string
  active: boolean
  dir: SortDir
  onClick: () => void
  className?: string
}

function SortHeader({ label, active, dir, onClick, className = '' }: SortHeaderProps) {
  const right = className.includes('text-right')
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-3 py-2.5 font-medium ${className}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 rounded hover:text-ink focus-visible:outline-2 focus-visible:outline-primary ${
          active ? 'text-ink' : ''
        } ${right ? 'flex-row-reverse' : ''}`}
      >
        {label}
        <span aria-hidden="true" className={active ? 'text-primary' : 'opacity-0'}>
          {dir === 'asc' || !active ? '↑' : '↓'}
        </span>
      </button>
    </th>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}

function FilterSelect({ label, value, onChange, children }: FilterSelectProps) {
  const active = value !== 'all'
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`h-9 cursor-pointer appearance-none rounded-lg border bg-surface pr-8 pl-3 text-sm shadow-xs transition-colors focus:outline-2 focus:outline-primary/30 ${
          active ? 'border-primary/40 font-medium text-primary' : 'border-border/80 text-ink'
        }`}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  )
}
