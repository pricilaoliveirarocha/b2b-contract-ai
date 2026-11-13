import { apiGet } from './api'
import type { Stage } from './deals'

// Mirrors OverviewOut / RuleOut in backend/app/schemas.py. Money values are decimal strings.
export interface Bucket {
  key: string
  count: number
  value: string
}

export interface OwnerBucket {
  owner: string
  deals: number
  open_value: string
  won_value: string
}

export interface RuleBlocker {
  rule_id: number
  rule_name: string
  severity: 'block' | 'warn'
  code: string
  params: Record<string, string>
  deals: number
  value: string
  avg_days_stuck: number
}

export interface OverdueDeal {
  deal_id: number
  title: string
  company: string
  owner: string | null
  stage: Stage
  value: string
  close_date: string // YYYY-MM-DD
  days_overdue: number
}

export interface LostDeal {
  deal_id: number
  title: string
  company: string
  owner: string | null
  value: string
  lost_at: string | null
  lost_from_stage: Stage | null
  notes: string | null // why it was lost, in the rep's words
}

export interface Overview {
  won_count: number
  lost_count: number
  lost_value: string
  win_rate: number | null
  avg_won_value: string | null
  avg_cycle_days: number | null
  overdue_count: number
  overdue_value: string
  by_stage: Bucket[]
  by_owner: OwnerBucket[]
  by_segment: Bucket[]
  rule_blockers: RuleBlocker[]
  overdue_deals: OverdueDeal[]
  lost_deals: LostDeal[]
}

export function fetchOverview(): Promise<Overview> {
  return apiGet<Overview>('/stats/overview')
}

// Chart colors mirror the tokens in index.css. The blue/orange pair passed the dataviz
// palette validator (CVD and normal-vision separation, contrast on white).
export const CHART = {
  primary: '#2f6fdf',
  secondary: '#e0752f',
  grid: '#e4e8f0',
  axis: '#667085',
}

/** Short money for axes: "R$ 1,8 mi" / "R$1.8M". */
export function formatCompactMoney(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}
