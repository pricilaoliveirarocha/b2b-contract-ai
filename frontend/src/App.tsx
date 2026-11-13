import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import DealsPage from './components/DealsPage'
import SettingsPage from './components/SettingsPage'
import Notice, { type NoticeData } from './components/Notice'
import RulesPage from './components/RulesPage'
import PipelineBoard from './components/PipelineBoard'
import PipelineStats from './components/PipelineStats'
import TopBar from './components/TopBar'
import { changeDealStage, fetchDeals, type Deal, type Stage } from './lib/deals'
import { useI18n } from './lib/i18nContext'
import { useRoute } from './lib/router'
import { fetchTrend, type TrendPoint } from './lib/stats'
import { describeViolation } from './lib/violations'

// Charts (Recharts) are heavy: only download them when the Analytics page is opened.
const AnalyticsPage = lazy(() => import('./components/AnalyticsPage'))

type LoadStatus = 'loading' | 'error' | 'ready'

export default function App() {
  const { t, locale } = useI18n()
  const route = useRoute()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [deals, setDeals] = useState<Deal[]>([])
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set())
  const [notice, setNotice] = useState<NoticeData | null>(null)
  const [search, setSearch] = useState('')
  const [trend, setTrend] = useState<TrendPoint[] | null>(null)
  // Stable reference so the notice's auto-dismiss timer is not restarted on every render.
  const dismissNotice = useCallback(() => setNotice(null), [])

  useEffect(() => {
    fetchDeals()
      .then((data) => {
        setDeals(data)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
    // The trend only feeds the sparklines; if it fails, the cards simply show no line.
    fetchTrend()
      .then(setTrend)
      .catch(() => setTrend(null))
  }, [])

  function setDealStage(dealId: number, stage: Stage) {
    setDeals((current) => current.map((d) => (d.id === dealId ? { ...d, stage } : d)))
  }

  function setPending(dealId: number, pending: boolean) {
    setPendingIds((current) => {
      const next = new Set(current)
      if (pending) next.add(dealId)
      else next.delete(dealId)
      return next
    })
  }

  async function handleMove(deal: Deal, stage: Stage) {
    const previousStage = deal.stage
    const vars = { company: deal.company.name, stage: t(`stage.${stage}`) }
    setNotice(null)
    setPending(deal.id, true)
    setDealStage(deal.id, stage) // optimistic: move now, undo if the API says no

    try {
      const result = await changeDealStage(deal.id, stage)
      if (result.ok) {
        setDeals((current) => current.map((d) => (d.id === deal.id ? result.deal : d)))
        setNotice(
          result.warnings.length > 0
            ? {
                kind: 'warning',
                title: t('notice.movedWithWarnings', vars),
                items: result.warnings.map((w) => describeViolation(w, t, locale)),
              }
            : { kind: 'success', title: t('notice.moved', vars), items: [] },
        )
      } else {
        setDealStage(deal.id, previousStage)
        setNotice({
          kind: 'blocked',
          title: t('notice.blocked', vars),
          items: result.violations.map((v) => describeViolation(v, t, locale)),
        })
      }
    } catch {
      setDealStage(deal.id, previousStage)
      setNotice({ kind: 'error', title: t('notice.error'), items: [] })
    } finally {
      setPending(deal.id, false)
    }
  }

  const query = search.trim().toLowerCase()
  const visibleDeals = query
    ? deals.filter((deal) =>
        [deal.title, deal.company.name, deal.owner ?? '', deal.area ?? ''].some((field) =>
          field.toLowerCase().includes(query),
        ),
      )
    : deals

  return (
    // The app fills the window exactly; only the board scrolls, never the page.
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar search={search} onSearchChange={setSearch} />

      {status === 'loading' && <CenteredMessage>{t('state.loading')}</CenteredMessage>}

      {status === 'error' && <CenteredMessage tone="danger">{t('state.error')}</CenteredMessage>}

      {status === 'ready' && deals.length === 0 && (
        <CenteredMessage>
          {t('state.emptyBefore')} <code className="rounded bg-border/60 px-1">python -m app.seed</code>{' '}
          {t('state.emptyAfter')}
        </CenteredMessage>
      )}

      {status === 'ready' && deals.length > 0 && route === 'deals' && <DealsPage deals={visibleDeals} />}

      {status === 'ready' && route === 'rules' && <RulesPage />}

      {status === 'ready' && route === 'settings' && <SettingsPage />}

      {status === 'ready' && deals.length > 0 && route === 'analytics' && (
        <Suspense fallback={<CenteredMessage>{t('an.loading')}</CenteredMessage>}>
          <AnalyticsPage trend={trend} />
        </Suspense>
      )}

      {status === 'ready' && deals.length > 0 && route === 'pipeline' && (
        <>
          <div className="shrink-0 px-4 py-3 sm:px-6">
            <PipelineStats deals={deals} trend={trend} />
          </div>

          <main className="flex min-h-0 flex-1 flex-col">
            {/* Only takes space while searching; the board itself shows that cards can be dragged. */}
            <p className="sr-only" role="status">
              {query
                ? t('search.results', { count: visibleDeals.length, total: deals.length, query: search.trim() })
                : t('hint.desktop')}
            </p>
            {query && (
              <p className="mb-2 shrink-0 truncate px-4 text-xs text-muted sm:px-6" aria-hidden="true">
                {t('search.results', { count: visibleDeals.length, total: deals.length, query: search.trim() })}
              </p>
            )}
            {visibleDeals.length === 0 ? (
              <CenteredMessage>
                {t('search.empty')}{' '}
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {t('search.clear')}
                </button>
              </CenteredMessage>
            ) : (
              <PipelineBoard deals={visibleDeals} pendingIds={pendingIds} onMove={handleMove} />
            )}
          </main>
        </>
      )}

      {notice && <Notice notice={notice} onDismiss={dismissNotice} />}
    </div>
  )
}

function CenteredMessage({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'danger' }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
      <p
        className={`max-w-sm text-sm ${tone === 'danger' ? 'text-danger' : 'text-muted'}`}
        role={tone === 'danger' ? 'alert' : 'status'}
      >
        {children}
      </p>
    </div>
  )
}
