import { ApiError, apiGet, apiPatch } from './api'

// Mirrors backend/app/domain.py and backend/app/schemas.py.
export type Stage =
  | 'discovery'
  | 'business_case'
  | 'poc'
  | 'infosec'
  | 'contracts'
  | 'closed_won'
  | 'closed_lost'

export type Priority = 'low' | 'medium' | 'high'

export interface Deal {
  id: number
  title: string
  company: { id: number; name: string }
  area: string | null
  stage: Stage
  value: string // decimal as string, e.g. "120000.00"
  currency: string
  priority: Priority
  close_date: string | null // YYYY-MM-DD
  owner: string | null
  last_touched_at: string | null
}

export interface StageInfo {
  id: Stage
  probability: number // mirrors STAGE_PROBABILITY in backend/app/domain.py (in %)
  hasInfo: boolean // shows the "i" button; label and description live in lib/i18n.tsx
}

export const STAGES: StageInfo[] = [
  { id: 'discovery', probability: 10, hasInfo: true },
  { id: 'business_case', probability: 25, hasInfo: true },
  { id: 'poc', probability: 50, hasInfo: true },
  { id: 'infosec', probability: 80, hasInfo: true },
  { id: 'contracts', probability: 90, hasInfo: true },
  { id: 'closed_won', probability: 100, hasInfo: false },
  { id: 'closed_lost', probability: 0, hasInfo: false },
]

export function stageProbability(stage: Stage): number {
  return STAGES.find((s) => s.id === stage)?.probability ?? 0
}

export function isOpen(stage: Stage): boolean {
  return stage !== 'closed_won' && stage !== 'closed_lost'
}

/** An open deal whose expected close date has already passed. */
export function isOverdue(deal: Deal, today = new Date()): boolean {
  if (!deal.close_date || !isOpen(deal.stage)) return false
  const todayIso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
  return deal.close_date < todayIso
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

export function fetchDeals(): Promise<Deal[]> {
  return apiGet<Deal[]>('/deals?limit=500')
}

export interface RuleViolation {
  rule_id: number
  rule_name: string
  severity: 'block' | 'warn'
  code: string // e.g. "requirement_missing"; translated in lib/violations.ts
  message: string // English fallback from the API
  params: Record<string, string>
}

export type StageChangeResult =
  | { ok: true; deal: Deal; warnings: RuleViolation[] }
  | { ok: false; violations: RuleViolation[] }

/** Moves a deal. A 409 (blocked by rules) is a normal outcome, not an exception. */
export async function changeDealStage(dealId: number, stage: Stage): Promise<StageChangeResult> {
  try {
    const result = await apiPatch<{ deal: Deal; warnings: RuleViolation[] }>(
      `/deals/${dealId}/stage`,
      { stage },
    )
    return { ok: true, ...result }
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const body = error.body as { detail?: { violations?: RuleViolation[] } } | null
      return { ok: false, violations: body?.detail?.violations ?? [] }
    }
    throw error
  }
}

export function formatMoney(value: number, locale: string, currency = 'BRL'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDate(isoDate: string, locale: string): string {
  // Build the date from its parts so it is not shifted by the local time zone.
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  })
}

// --- Deal detail (GET /api/deals/{id}); mirrors DealDetailOut in backend/app/schemas.py ---

export type ContractStatus = 'draft' | 'in_review' | 'signed'

export interface DealDetail extends Deal {
  notes: string | null
  contract: {
    status: ContractStatus
    total_value: string
    duration_months: number
    start_date: string | null
    payment_terms: string | null
    discount_percent: string
  } | null
  requirements: { kind: string; label: string; is_done: boolean; done_at: string | null }[]
  stage_history: { from_stage: Stage | null; to_stage: Stage; changed_at: string }[]
}

export function fetchDeal(dealId: number, signal?: AbortSignal): Promise<DealDetail> {
  return apiGet<DealDetail>(`/deals/${dealId}`, signal)
}

/** Full date ("13 Nov 2026"). Accepts a date (YYYY-MM-DD) or a timestamp. */
export function formatFullDate(value: string, locale: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? (() => {
        const [year, month, day] = value.split('-').map(Number)
        return new Date(year, month - 1, day)
      })()
    : new Date(value)
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "3 days ago" / "há 3 dias". */
export function formatRelative(timestamp: string, locale: string, now = new Date()): string {
  const days = Math.round((new Date(timestamp).getTime() - now.getTime()) / 86_400_000)
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day')
}
