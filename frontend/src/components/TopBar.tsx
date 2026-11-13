import { useI18n } from '../lib/i18nContext'
import MainNav from './MainNav'
import { useRoute } from '../lib/router'
import type { Locale } from '../lib/messages'

interface TopBarProps {
  search: string
  onSearchChange: (value: string) => void
}

/** Minimal top bar: navigation, search and language. The page title stays available to screen readers. */
export default function TopBar({ search, onSearchChange }: TopBarProps) {
  const { t } = useI18n()
  const route = useRoute()

  return (
    // One row on desktop; on phones the search wraps to its own row under the menu.
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/70 px-4 py-2 sm:px-6">
      <h1 className="sr-only">{t(`nav.${route}`)}</h1>
      <MainNav />
      <div className="order-3 w-full md:order-2 md:ml-auto md:w-80">
        <SearchBox value={search} onChange={onSearchChange} />
      </div>
      <div className="order-2 ml-auto md:order-3 md:ml-0">
        <LanguageToggle />
      </div>
    </header>
  )
}

/** One button with the flag of the language you can switch TO. */
function LanguageToggle() {
  const { t, locale, setLocale } = useI18n()
  const next: Locale = locale === 'pt-BR' ? 'en' : 'pt-BR'
  const label = t('lang.switch')

  return (
    <button
      type="button"
      lang={next}
      onClick={() => setLocale(next)}
      aria-label={label}
      title={label}
      // Just the flag; the padding keeps a comfortable click/touch target around it.
      className="grid shrink-0 place-items-center rounded-md p-2 transition-transform duration-150 hover:scale-110 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span
        className="block h-4 w-6 overflow-hidden rounded-[3px] shadow-[0_1px_3px_rgb(16_24_40/0.2)] ring-1 ring-black/10"
        aria-hidden="true"
      >
        {next === 'en' ? <FlagUSA /> : <FlagBrazil />}
      </span>
    </button>
  )
}

function FlagUSA() {
  const stripe = 20 / 13
  return (
    <svg viewBox="0 0 30 20" className="block size-full" preserveAspectRatio="none">
      <rect width="30" height="20" fill="#B22234" />
      {[1, 3, 5, 7, 9, 11].map((i) => (
        <rect key={i} y={i * stripe} width="30" height={stripe} fill="#FFFFFF" />
      ))}
      <rect width="12" height={stripe * 7} fill="#3C3B6E" />
      {[2, 6, 10].map((x) => [2.2, 5.4, 8.6].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.8" fill="#FFFFFF" />))}
    </svg>
  )
}

function FlagBrazil() {
  return (
    <svg viewBox="0 0 30 20" className="block size-full" preserveAspectRatio="none">
      <rect width="30" height="20" fill="#009C3B" />
      <polygon points="15,2.2 27.5,10 15,17.8 2.5,10" fill="#FFDF00" />
      <circle cx="15" cy="10" r="4.6" fill="#002776" />
      <path d="M10.6 9.3 Q15 7.9 19.5 10.6" fill="none" stroke="#FFFFFF" strokeWidth="0.8" />
    </svg>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n()

  return (
    <label className="relative block w-full">
      <span className="sr-only">{t('search.label')}</span>
      <svg
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && onChange('')}
        placeholder={t('search.placeholder')}
        className="h-9 w-full rounded-full border border-border/80 bg-surface pr-4 pl-9 text-sm shadow-xs transition-colors placeholder:text-muted focus:border-primary focus:outline-2 focus:outline-primary/20"
      />
    </label>
  )
}
