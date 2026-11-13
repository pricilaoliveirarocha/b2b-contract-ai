import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { setAdminToken, useAdminToken } from '../lib/admin'
import { ApiError } from '../lib/api'
import { fetchOverview, formatCompactMoney, type RuleBlocker } from '../lib/analytics'
import { useI18n } from '../lib/i18nContext'
import { fetchInsights, type Insight } from '../lib/insights'
import { describeRuleParams } from '../lib/ruleText'
import {
  createRule,
  deleteRule,
  draftRule,
  fetchRules,
  updateRule,
  type Rule,
  type RuleDraft,
  type RuleInput,
  type RuleType,
} from '../lib/rules'
import InsightsPanel from './InsightsPanel'
import Modal from './Modal'
import Notice, { type NoticeData } from './Notice'
import RuleAiBox from './RuleAiBox'
import RuleFormDialog from './RuleFormDialog'
import StageBadge from './StageBadge'
import Switch from './Switch'

const isAuthError = (error: unknown) => error instanceof ApiError && (error.status === 401 || error.status === 403)

// Column widths shared by the header row and every rule row (large screens).
const COLUMNS = 'lg:grid-cols-[minmax(0,1.5fr)_8.5rem_minmax(0,1.5fr)_6.5rem_9rem_9.5rem]'

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; rules: Rule[] }

/**
 * Contract rules. Everyone can read them; creating, editing, deleting and switching rules on or off
 * needs the administrator key, and the server enforces it (the buttons here are only a convenience).
 * Insights on the right come from the data; the AI box turns plain language into a draft to review.
 */
export default function RulesPage() {
  const { t, locale } = useI18n()
  const token = useAdminToken()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [editing, setEditing] = useState<Rule | 'new' | null>(null)
  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const [deleting, setDeleting] = useState<Rule | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [notice, setNotice] = useState<NoticeData | null>(null)
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [insights, setInsights] = useState<Insight[] | null>(null)
  const [insightsFailed, setInsightsFailed] = useState(false)
  const [impact, setImpact] = useState<Map<number, RuleBlocker>>(new Map())
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const dismissNotice = useCallback(() => setNotice(null), [])

  /** Insights and the per-rule impact depend on the rules: refresh them after every change. */
  const reloadInsights = useCallback(() => {
    fetchInsights()
      .then((list) => {
        setInsights(list)
        setInsightsFailed(false)
      })
      .catch(() => setInsightsFailed(true))
    fetchOverview()
      .then((overview) => setImpact(new Map(overview.rule_blockers.map((b) => [b.rule_id, b]))))
      .catch(() => setImpact(new Map())) // the impact line is a bonus: without it the page still works
  }, [])

  useEffect(() => {
    fetchRules()
      .then((rules) => setState({ status: 'ready', rules }))
      .catch(() => setState({ status: 'error' }))
    reloadInsights()
  }, [reloadInsights])

  // The highlight after "View rule" fades on its own.
  useEffect(() => {
    if (highlightId === null) return
    const timer = window.setTimeout(() => setHighlightId(null), 2400)
    return () => window.clearTimeout(timer)
  }, [highlightId])

  const setRules = (change: (rules: Rule[]) => Rule[]) =>
    setState((current) => (current.status === 'ready' ? { status: 'ready', rules: change(current.rules) } : current))

  /** The server said the key is no longer valid: drop administrator mode and explain. */
  function expireSession() {
    setAdminToken(null)
    setEditing(null)
    setDraft(null)
    setDeleting(null)
    setNotice({ kind: 'error', title: t('rules.admin.expired'), items: [] })
  }

  /** Runs an administrator call; a 401/403 ends the session, any other failure is rethrown. */
  async function asAdmin<T>(action: (adminToken: string) => Promise<T>): Promise<T> {
    if (!token) throw new Error('not an administrator')
    try {
      return await action(token)
    } catch (error) {
      if (isAuthError(error)) expireSession()
      throw error
    }
  }

  async function toggle(rule: Rule) {
    setBusyId(rule.id)
    try {
      const updated = await asAdmin((key) => updateRule(rule.id, { is_active: !rule.is_active }, key))
      setRules((rules) => rules.map((r) => (r.id === updated.id ? updated : r)))
      reloadInsights()
    } catch (error) {
      // An expired session already explained itself (see expireSession); don't overwrite that message.
      if (!isAuthError(error)) setNotice({ kind: 'error', title: t('rules.form.error'), items: [] })
    } finally {
      setBusyId(null)
    }
  }

  async function save(input: RuleInput, ruleType: RuleType) {
    if (editing === 'new') {
      const created = await asAdmin((key) => createRule({ ...input, rule_type: ruleType }, key))
      setRules((rules) => [...rules, created])
      setNotice({ kind: 'success', title: t('rules.notice.created'), items: [] })
      setAiText('')
    } else if (editing) {
      const id = editing.id
      const updated = await asAdmin((key) => updateRule(id, input, key))
      setRules((rules) => rules.map((r) => (r.id === updated.id ? updated : r)))
      setNotice({ kind: 'success', title: t('rules.notice.updated'), items: [] })
    }
    closeForm()
    reloadInsights()
  }

  async function confirmDelete(rule: Rule) {
    await asAdmin((key) => deleteRule(rule.id, key))
    setRules((rules) => rules.filter((r) => r.id !== rule.id))
    setDeleting(null)
    setNotice({ kind: 'success', title: t('rules.notice.deleted'), items: [] })
    reloadInsights()
  }

  function closeForm() {
    setEditing(null)
    setDraft(null)
  }

  /** Plain language in, a draft out. The draft opens in the form: nothing is saved until confirmed. */
  async function generate(text: string) {
    setAiBusy(true)
    setAiError(null)
    try {
      const result = await asAdmin((key) => draftRule(text.trim(), key))
      setDraft(result)
      setEditing('new')
    } catch (error) {
      if (isAuthError(error)) return
      setAiError(aiErrorMessage(error))
    } finally {
      setAiBusy(false)
    }
  }

  function aiErrorMessage(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.status === 503) return t('rules.ai.notConfigured')
      if (error.status === 422) {
        // The server explains why a request can't become a rule; a validation list means "too short".
        const detail = (error.body as { detail?: unknown } | null)?.detail
        return typeof detail === 'string' ? detail : t('rules.ai.tooShort')
      }
    }
    return t('rules.ai.unavailable')
  }

  function createFromInsight(prompt: string) {
    setAiText(prompt)
    void generate(prompt)
  }

  function viewRule(ruleId: number) {
    document.getElementById(`rule-${ruleId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightId(ruleId)
  }

  const isAdmin = token !== null

  return (
    // Full width. On large screens the page itself doesn't scroll: the list and the insights do.
    <main className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 pb-6 sm:px-6 xl:overflow-hidden">
      <div className="grid gap-x-8 gap-y-6 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex min-w-0 flex-col xl:min-h-0">
          <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight">{t('rules.title')}</h2>
              <p className="text-sm text-muted">{t('rules.subtitle')}</p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null)
                    setEditing('new')
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-white shadow-xs hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  {t('rules.new')}
                </button>
              )}
            </div>
          </header>

          <div className="mb-3 shrink-0">
            <RuleAiBox
              isAdmin={isAdmin}
              value={aiText}
              onChange={setAiText}
              onSubmit={() => void generate(aiText)}
              busy={aiBusy}
              error={aiError}
            />
            {!isAdmin && <p className="mt-2 px-1 text-xs text-muted">{t('rules.readOnly')}</p>}
          </div>

          <div className="scroll-thin min-h-0 flex-1 xl:overflow-y-auto xl:pr-1">
            {state.status === 'loading' && (
              <p className="text-sm text-muted" role="status">
                {t('rules.loading')}
              </p>
            )}
            {state.status === 'error' && (
              <p className="text-sm text-danger" role="alert">
                {t('rules.error')}
              </p>
            )}
            {state.status === 'ready' && state.rules.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted">
                {t(isAdmin ? 'rules.emptyAdmin' : 'rules.empty')}
              </p>
            )}

            {state.status === 'ready' && state.rules.length > 0 && (
              <div
                role="table"
                aria-label={t('rules.title')}
                className="overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-[0_1px_3px_rgb(16_24_40/0.06)]"
              >
                <div
                  role="row"
                  className={`${COLUMNS} hidden gap-x-4 border-b border-border/70 bg-background/70 px-4 py-2.5 text-[11px] font-semibold tracking-wide text-muted uppercase lg:grid`}
                >
                  <span role="columnheader">{t('rules.col.name')}</span>
                  <span role="columnheader">{t('rules.col.on')}</span>
                  <span role="columnheader">{t('rules.col.rule')}</span>
                  <span role="columnheader">{t('rules.col.effect')}</span>
                  <span role="columnheader">{t('rules.col.blocked')}</span>
                  <span role="columnheader" className="text-right">
                    {t(isAdmin ? 'rules.col.actions' : 'rules.col.status')}
                  </span>
                </div>

                <div role="rowgroup" className="divide-y divide-border/70">
                  {state.rules.map((rule) => {
                    const blocker = impact.get(rule.id)
                    const condition = describeRuleParams(rule, t, locale)
                    const blockedValue = blocker ? formatCompactMoney(Number(blocker.value), locale) : ''
                    return (
                      <div
                        role="row"
                        key={rule.id}
                        id={`rule-${rule.id}`}
                        className={`${COLUMNS} flex scroll-mt-4 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors duration-500 lg:grid ${
                          highlightId === rule.id ? 'bg-violet/10' : 'hover:bg-background/70'
                        } ${rule.is_active ? '' : 'opacity-60'}`}
                      >
                        <div role="cell" className="min-w-0 basis-full lg:basis-auto">
                          <p className="truncate text-sm font-semibold" title={rule.name}>
                            {rule.name}
                          </p>
                          {rule.description && (
                            <p className="truncate text-xs text-muted" title={rule.description}>
                              {rule.description}
                            </p>
                          )}
                        </div>

                        <div role="cell">
                          <span className="sr-only lg:hidden">{t('rules.col.on')}: </span>
                          <StageBadge stage={rule.target_stage} />
                        </div>

                        <div role="cell" className="min-w-0 flex-1 truncate text-[13px] text-ink/80 lg:flex-none" title={condition}>
                          <span className="sr-only lg:hidden">{t('rules.col.rule')}: </span>
                          {condition}
                        </div>

                        <div role="cell" className="text-xs font-medium text-ink/70">
                          <span className="sr-only lg:hidden">{t('rules.col.effect')}: </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={`size-1.5 rounded-full ${rule.severity === 'block' ? 'bg-danger' : 'bg-warning'}`}
                              aria-hidden="true"
                            />
                            {t(rule.severity === 'block' ? 'an.severity.block' : 'an.severity.warn')}
                          </span>
                        </div>

                        <div role="cell" className="text-xs font-medium whitespace-nowrap">
                          <span className="sr-only lg:hidden">{t('rules.col.blocked')}: </span>
                          {blocker ? (
                            <span
                              className="text-warning"
                              title={t('rules.impact', {
                                count: blocker.deals,
                                value: blockedValue,
                                days: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(blocker.avg_days_stuck),
                              })}
                            >
                              {blocker.deals === 1
                                ? t('rules.impactOne', { value: blockedValue })
                                : t('rules.impactShort', { count: blocker.deals, value: blockedValue })}
                            </span>
                          ) : (
                            <span className="text-muted">{t('rules.noImpact')}</span>
                          )}
                        </div>

                        <div role="cell" className="ml-auto flex items-center justify-end lg:ml-0">
                          {isAdmin ? (
                            <span className="flex items-center gap-0.5">
                              <Switch
                                compact
                                checked={rule.is_active}
                                label={t('rules.toggle', { name: rule.name })}
                                onText={t('rules.active')}
                                offText={t('rules.inactive')}
                                disabled={busyId === rule.id}
                                onChange={() => void toggle(rule)}
                              />
                              <IconButton
                                label={t('rules.editNamed', { name: rule.name })}
                                onClick={() => {
                                  setDraft(null)
                                  setEditing(rule)
                                }}
                              >
                                <path d="M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4" />
                              </IconButton>
                              <IconButton
                                label={t('rules.deleteNamed', { name: rule.name })}
                                danger
                                onClick={() => setDeleting(rule)}
                              >
                                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                              </IconButton>
                            </span>
                          ) : (
                            <span className="text-xs text-muted">{t(rule.is_active ? 'rules.active' : 'rules.inactive')}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="flex min-w-0 flex-col xl:min-h-0 xl:border-l xl:border-border/70 xl:pl-6">
          <InsightsPanel
            insights={insights}
            failed={insightsFailed}
            isAdmin={isAdmin}
            onCreateRule={createFromInsight}
            onViewRule={viewRule}
          />
        </aside>
      </div>

      {editing && isAdmin && (
        <RuleFormDialog
          rule={editing === 'new' ? null : editing}
          draft={editing === 'new' ? draft : null}
          onSubmit={save}
          onClose={closeForm}
        />
      )}
      {deleting && isAdmin && (
        <DeleteDialog rule={deleting} onConfirm={() => confirmDelete(deleting)} onClose={() => setDeleting(null)} />
      )}
      {notice && <Notice notice={notice} onDismiss={dismissNotice} />}
    </main>
  )
}

function IconButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-9 place-items-center rounded-lg text-muted transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
        danger ? 'hover:bg-danger/10 hover:text-danger' : 'hover:bg-background hover:text-ink'
      }`}
    >
      <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}

function DeleteDialog({ rule, onConfirm, onClose }: { rule: Rule; onConfirm: () => Promise<void>; onClose: () => void }) {
  const { t } = useI18n()
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)

  async function confirm() {
    setWorking(true)
    setFailed(false)
    try {
      await onConfirm()
    } catch {
      setFailed(true)
      setWorking(false)
    }
  }

  return (
    <Modal
      title={t('rules.delete.title')}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg px-4 text-sm font-medium text-muted hover:bg-background hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
          >
            {t('rules.form.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={working}
            className="h-10 rounded-lg bg-danger px-5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-wait disabled:opacity-60"
          >
            {t('rules.delete.confirm')}
          </button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed">{t('rules.delete.body', { name: rule.name })}</p>
      {failed && (
        <p className="mt-3 text-xs font-medium text-danger" role="alert">
          {t('rules.delete.error')}
        </p>
      )}
    </Modal>
  )
}
