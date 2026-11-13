import type { MouseEvent, ReactNode } from 'react'
import { useI18n } from '../lib/i18nContext'
import type { MessageKey } from '../lib/messages'
import { navigate, pathFor, useRoute, type Route } from '../lib/router'

interface NavItem {
  label: MessageKey
  icon: ReactNode
  route?: Route // pages without a route don't exist yet: shown, but disabled
}

const ITEMS: NavItem[] = [
  {
    label: 'nav.pipeline',
    route: 'pipeline',
    icon: (
      <>
        <rect x="3" y="4" width="5" height="16" rx="1.5" />
        <rect x="10" y="4" width="5" height="10" rx="1.5" />
        <rect x="17" y="4" width="4" height="13" rx="1.5" />
      </>
    ),
  },
  {
    label: 'nav.deals',
    route: 'deals',
    icon: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
      </>
    ),
  },
  {
    label: 'nav.analytics',
    route: 'analytics',
    icon: <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />,
  },
  {
    label: 'nav.settings',
    route: 'settings',
    icon: (
      <>
        <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
        <circle cx="15" cy="6" r="2" />
        <circle cx="9" cy="12" r="2" />
        <circle cx="17" cy="18" r="2" />
      </>
    ),
  },
]

/**
 * Main navigation in the top bar. Plain links, no pills: the current page is ink + a thin
 * blue underline. On phones only the current page shows its name; the rest are icons.
 */
export default function MainNav() {
  const { t } = useI18n()
  const current = useRoute()

  return (
    <nav aria-label={t('nav.main')}>
      <ul className="flex items-center gap-1 sm:gap-3">
        {ITEMS.map((item) => (
          <li key={item.label}>
            <NavLink item={item} current={current} label={t(item.label)} soon={t('nav.soon')} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

interface NavLinkProps {
  item: NavItem
  current: Route
  label: string
  soon: string
}

function NavLink({ item, current, label, soon }: NavLinkProps) {
  const icon = (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {item.icon}
    </svg>
  )
  const base =
    'relative flex h-9 items-center gap-1.5 px-1.5 text-sm transition-colors duration-150 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-primary'

  if (item.route) {
    const route = item.route
    const active = route === current
    const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
      // Let ctrl/cmd-click open a new tab as usual.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
      event.preventDefault()
      navigate(route)
    }
    return (
      <a
        href={pathFor(route)}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`${base} ${active ? 'font-semibold text-ink' : 'font-medium text-muted hover:text-ink'}`}
      >
        {icon}
        <span className={active ? '' : 'hidden sm:inline'}>{label}</span>
        {active && (
          <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-primary" aria-hidden="true" />
        )}
      </a>
    )
  }

  // Not built yet: focusable so keyboard users can discover it, but it does nothing.
  return (
    <button
      type="button"
      aria-disabled="true"
      aria-label={`${label} (${soon})`}
      className={`group ${base} cursor-default font-medium text-muted/70 hover:text-muted`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span
        className="pointer-events-none absolute top-full left-1/2 z-30 mt-1 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-[11px] font-medium whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden="true"
      >
        {soon}
      </span>
    </button>
  )
}
