import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { describeInsight, type Insight, type InsightView } from '../lib/insights'
import { useI18n } from '../lib/i18nContext'
import SparkIcon from './SparkIcon'

interface InsightsPanelProps {
  insights: Insight[] | null // null = still loading
  failed: boolean
  isAdmin: boolean
  onCreateRule: (prompt: string) => void
  onViewRule: (ruleId: number) => void
}

const DOT = { warning: 'bg-warning', opportunity: 'bg-violet', info: 'bg-primary' } as const
const SPEED = 16 // pixels per second: slow on purpose, so it can be read while it moves

/** True when the person asked their system for less motion. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

/**
 * Findings computed from the deals and the rules, as a quiet list. When there are more than fit in
 * the space, the list rolls slowly upwards like a carousel. It pauses on hover, on keyboard focus and
 * with the pause button, and it doesn't move at all for people who asked for reduced motion.
 */
export default function InsightsPanel({ insights, failed, isAdmin, onCreateRule, onViewRule }: InsightsPanelProps) {
  const { t, locale } = useI18n()
  const reducedMotion = usePrefersReducedMotion()
  const [paused, setPaused] = useState(false)
  const [engaged, setEngaged] = useState(false) // pointer or keyboard focus is inside
  const viewportRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [heights, setHeights] = useState({ list: 0, viewport: 0 })

  // Keep the measurements current: the list changes with the insights, the viewport with the window.
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const list = listRef.current
    if (!viewport || !list) return
    const measure = () => setHeights({ list: list.offsetHeight, viewport: viewport.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(list)
    return () => observer.disconnect()
  }, [insights])

  const views = (insights ?? []).map((insight) => ({ insight, view: describeInsight(insight, t, locale) }))
  const rolling = !reducedMotion && views.length > 0 && heights.list > heights.viewport + 1
  const running = rolling && !paused && !engaged

  const renderList = (copy: boolean) => (
    <ul
      // The second copy only exists to make the loop seamless: hide it from everything.
      ref={copy ? undefined : listRef}
      inert={copy}
      aria-hidden={copy || undefined}
    >
      {views.map(({ insight, view }) => (
        <InsightItem
          key={`${insight.kind}-${insight.params.rule_id ?? ''}`}
          insight={insight}
          view={view}
          isAdmin={isAdmin}
          onCreateRule={onCreateRule}
          onViewRule={onViewRule}
          createLabel={t('ins.createRule')}
          viewLabel={t('rules.viewRule')}
          needsAdmin={t('ins.createRuleNeedsAdmin')}
        />
      ))}
    </ul>
  )

  return (
    <section aria-labelledby="insights-title" title={t('ins.subtitle')} className="flex min-h-0 flex-1 flex-col">
      <header className="mb-1 flex shrink-0 items-center justify-between">
        <h3
          id="insights-title"
          className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase"
        >
          <SparkIcon className="size-3.5 text-violet" />
          {t('ins.title')}
        </h3>
        {rolling && (
          <button
            type="button"
            aria-pressed={paused}
            aria-label={t(paused ? 'ins.play' : 'ins.pause')}
            title={t(paused ? 'ins.play' : 'ins.pause')}
            onClick={() => setPaused((value) => !value)}
            className="grid size-7 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-background hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              {paused ? <path d="M7 4.5v15l12-7.5-12-7.5Z" /> : <path d="M6 4h4v16H6V4Zm8 0h4v16h-4V4Z" />}
            </svg>
          </button>
        )}
      </header>

      {failed && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {t('ins.error')}
        </p>
      )}
      {!failed && insights && insights.length === 0 && <p className="mt-2 text-sm text-muted">{t('ins.empty')}</p>}

      {views.length > 0 && (
        <div
          ref={viewportRef}
          onMouseEnter={() => setEngaged(true)}
          onMouseLeave={() => setEngaged(false)}
          onFocusCapture={() => setEngaged(true)}
          onBlurCapture={() => setEngaged(false)}
          className={`relative min-h-0 flex-1 ${reducedMotion ? 'scroll-thin overflow-y-auto' : 'overflow-hidden'} ${
            rolling ? '[mask-image:linear-gradient(to_bottom,transparent,black_20px,black_calc(100%-20px),transparent)]' : ''
          }`}
        >
          <div
            className={rolling ? 'roll-y' : ''}
            style={rolling ? { animationDuration: `${heights.list / SPEED}s`, animationPlayState: running ? 'running' : 'paused' } : undefined}
          >
            {renderList(false)}
            {rolling && renderList(true)}
          </div>
        </div>
      )}
    </section>
  )
}

interface InsightItemProps {
  insight: Insight
  view: InsightView
  isAdmin: boolean
  onCreateRule: (prompt: string) => void
  onViewRule: (ruleId: number) => void
  createLabel: string
  viewLabel: string
  needsAdmin: string
}

function InsightItem({ insight, view, isAdmin, onCreateRule, onViewRule, createLabel, viewLabel, needsAdmin }: InsightItemProps) {
  return (
    // Every item has its own bottom border (not "divide-y") so the two copies join without a gap.
    <li className="border-b border-border/70 py-3">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <span className={`size-1.5 shrink-0 rounded-full ${DOT[insight.severity]}`} aria-hidden="true" />
        {view.title}
      </p>
      <p className="mt-1 pl-3.5 text-xs leading-relaxed text-muted">{view.text}</p>

      {(view.prompt || view.ruleId) && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-3.5">
          {view.prompt && (
            <button
              type="button"
              disabled={!isAdmin}
              title={isAdmin ? undefined : needsAdmin}
              onClick={() => onCreateRule(view.prompt!)}
              className="rounded text-xs font-semibold text-violet hover:underline focus-visible:outline-2 focus-visible:outline-violet disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
            >
              {createLabel}
            </button>
          )}
          {view.ruleId ? (
            <button
              type="button"
              onClick={() => onViewRule(view.ruleId!)}
              className="rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              {viewLabel}
            </button>
          ) : null}
        </p>
      )}
    </li>
  )
}
