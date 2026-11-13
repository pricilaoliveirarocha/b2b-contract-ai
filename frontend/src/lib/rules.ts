import { apiDelete, apiGet, apiPatch, apiPost } from './api'
import type { Stage } from './deals'

// Mirrors RuleOut / RuleCreateIn / RuleUpdateIn in backend/app/schemas.py.
export type RuleType = 'requirement_done' | 'max_discount' | 'approval_above_value'
export type Severity = 'block' | 'warn'

export interface Rule {
  id: number
  name: string
  description: string | null
  rule_type: RuleType
  target_stage: Stage
  severity: Severity
  params: Record<string, string | number>
  is_active: boolean
}

export const RULE_TYPES: RuleType[] = ['requirement_done', 'max_discount', 'approval_above_value']

// Checklist items the app creates for deals today (see backend/app/seed.py). A rule can only be
// satisfied by an item that exists, so the form offers these instead of free text.
export const KNOWN_REQUIREMENTS = ['dpa', 'security_questionnaire', 'board_approval'] as const

/** Which parameters each rule type uses. */
export const PARAMS_BY_TYPE: Record<RuleType, { requirement: boolean; maxPercent: boolean; minValue: boolean }> = {
  requirement_done: { requirement: true, maxPercent: false, minValue: false },
  max_discount: { requirement: false, maxPercent: true, minValue: false },
  approval_above_value: { requirement: true, maxPercent: false, minValue: true },
}

export interface RuleInput {
  name: string
  description: string
  target_stage: Stage
  severity: Severity
  is_active: boolean
  requirement_kind?: string
  max_percent?: string
  min_value?: string
}

export function fetchRules(): Promise<Rule[]> {
  return apiGet<Rule[]>('/rules')
}

export function createRule(input: RuleInput & { rule_type: RuleType }, adminToken: string): Promise<Rule> {
  return apiPost<Rule>('/rules', input, adminToken)
}

export function updateRule(ruleId: number, changes: Partial<RuleInput>, adminToken: string): Promise<Rule> {
  return apiPatch<Rule>(`/rules/${ruleId}`, changes, adminToken)
}

export function deleteRule(ruleId: number, adminToken: string): Promise<void> {
  return apiDelete(`/rules/${ruleId}`, adminToken)
}

/** A rule proposed by the AI (POST /api/rules/draft). Not saved: the administrator reviews it first. */
export interface RuleDraft {
  rule: {
    name: string
    description: string | null
    rule_type: RuleType
    target_stage: Stage
    severity: Severity
    is_active: boolean
    requirement_kind: string | null
    max_percent: string | null
    min_value: string | null
  }
  explanation: string
}

export function draftRule(text: string, adminToken: string): Promise<RuleDraft> {
  return apiPost<RuleDraft>('/rules/draft', { text }, adminToken)
}
