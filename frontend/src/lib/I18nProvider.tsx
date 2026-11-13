import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, type I18nValue, type Translate } from './i18nContext'
import { MESSAGES, type Locale } from './messages'

const STORAGE_KEY = 'b2b-contract-ai:locale'

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'pt-BR') return saved
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); fall back below.
  }
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not critical: the choice just won't be remembered.
    }
  }, [])

  const value = useMemo<I18nValue>(() => {
    const t: Translate = (key, vars) =>
      MESSAGES[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
        vars && name in vars ? String(vars[name]) : match,
      )
    return { locale, setLocale, t }
  }, [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
