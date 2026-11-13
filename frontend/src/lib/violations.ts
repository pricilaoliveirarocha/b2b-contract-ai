import type { RuleViolation } from './deals'
import type { Translate } from './i18nContext'
import { isMessageKey } from './messages'

/** Turns a rule violation from the API into a sentence in the current language. */
export function describeViolation(violation: RuleViolation, t: Translate, locale: string): string {
  const { code, params } = violation
  const requirement = () => {
    const key = `requirement.${params.requirement}`
    // Known checklist items are translated; unknown ones fall back to the label sent by the API.
    return isMessageKey(key) ? t(key) : (params.label ?? params.requirement ?? '')
  }

  switch (code) {
    case 'requirement_missing':
      return t('violation.requirement_missing', { requirement: requirement() })
    case 'requirement_not_done':
      return t('violation.requirement_not_done', { requirement: requirement() })
    case 'discount_above_limit': {
      const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
      return t('violation.discount_above_limit', {
        discount: percent.format(Number(params.discount)),
        max: percent.format(Number(params.max)),
      })
    }
    default:
      // A rule type this version of the app doesn't know: show what the API sent.
      return `${violation.rule_name}: ${violation.message}`
  }
}
