import { formatMoney } from './deals'
import type { Translate } from './i18nContext'
import { isMessageKey } from './messages'
import type { Rule } from './rules'

/** Name of a checklist item; unknown identifiers are shown as they are. */
export function requirementLabel(kind: string, t: Translate): string {
  const key = `requirement.${kind}`
  return isMessageKey(key) ? t(key) : kind
}

/** One-line description of what a rule checks, in the current language. */
export function describeRuleParams(rule: Rule, t: Translate, locale: string): string {
  const { params } = rule
  const item = requirementLabel(String(params.requirement_kind ?? ''), t)

  switch (rule.rule_type) {
    case 'requirement_done':
      return t('rules.param.requires', { item })
    case 'max_discount':
      return t('rules.param.maxDiscount', {
        percent: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(params.max_percent)),
      })
    case 'approval_above_value':
      return t('rules.param.approval', { value: formatMoney(Number(params.min_value), locale), item })
  }
}
