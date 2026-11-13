import { apiGet } from './api'
import { formatCompactMoney } from './analytics'
import type { Stage } from './deals'
import type { Translate } from './i18nContext'
import { requirementLabel } from './ruleText'

// Mirrors InsightOut in backend/app/schemas.py. The server sends facts; the sentence is written here.
export interface Insight {
  kind: string
  severity: 'warning' | 'opportunity' | 'info'
  params: Record<string, string>
}

export function fetchInsights(): Promise<Insight[]> {
  return apiGet<{ insights: Insight[] }>('/stats/insights').then((body) => body.insights)
}

export interface InsightView {
  title: string
  text: string
  /** A rule description the user can send to the AI generator. */
  prompt?: string
  /** A rule on the page this insight is about. */
  ruleId?: number
}

export function describeInsight(insight: Insight, t: Translate, locale: string): InsightView {
  const p = insight.params
  const money = (value: string) => formatCompactMoney(Number(value), locale)
  const number = (value: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Number(value))

  switch (insight.kind) {
    case 'bottleneck':
      return {
        title: t('ins.bottleneck.title'),
        text: t('ins.bottleneck.text', {
          rule: p.rule_name ?? '',
          deals: p.deals ?? '',
          value: money(p.value ?? '0'),
          days: number(p.avg_days ?? '0'),
        }),
        ruleId: Number(p.rule_id),
      }
    case 'overdue':
      return {
        title: t('ins.overdue.title'),
        text: t('ins.overdue.text', {
          count: p.count ?? '',
          value: money(p.value ?? '0'),
          company: p.worst_company ?? '',
          days: p.worst_days ?? '',
        }),
      }
    case 'discount_gap':
      return {
        title: t('ins.discount_gap.title'),
        text: t('ins.discount_gap.text', {
          deals: p.deals ?? '',
          value: money(p.value ?? '0'),
          limit: number(p.limit ?? '0'),
          max: number(p.max_discount ?? '0'),
        }),
        prompt: t('ins.discount_gap.prompt', { limit: number(p.limit ?? '0') }),
        ruleId: Number(p.rule_id),
      }
    case 'approval_gap': {
      const item = requirementLabel(p.requirement ?? '', t)
      const threshold = formatCompactMoney(Number(p.threshold ?? '0'), locale)
      return {
        title: t('ins.approval_gap.title'),
        text: t('ins.approval_gap.text', { deals: p.deals ?? '', value: money(p.value ?? '0'), threshold, item }),
        prompt: t('ins.approval_gap.prompt', { item: item.toLowerCase(), threshold }),
        ruleId: Number(p.rule_id),
      }
    }
    case 'lost_concentration':
      return {
        title: t('ins.lost_concentration.title'),
        text: t('ins.lost_concentration.text', {
          count: p.count ?? '',
          total: p.total ?? '',
          value: money(p.value ?? '0'),
          stage: t(`stage.${(p.stage ?? 'discovery') as Stage}`),
        }),
      }
    case 'inactive_rules':
      return {
        title: t('ins.inactive_rules.title'),
        text: t('ins.inactive_rules.text', { count: p.count ?? '', rule: p.rule_name ?? '' }),
        ruleId: Number(p.rule_id),
      }
    case 'uncovered_stages':
      return {
        title: t('ins.uncovered_stages.title'),
        text: t('ins.uncovered_stages.text', {
          stages: (p.stages ?? '')
            .split(',')
            .filter(Boolean)
            .map((stage) => t(`stage.${stage as Stage}`))
            .join(', '),
        }),
      }
    default:
      // A kind this version of the app doesn't know yet: show it rather than hide it.
      return { title: insight.kind, text: '' }
  }
}
