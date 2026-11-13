import { useSyncExternalStore } from 'react'

// Tiny router: a handful of pages doesn't justify a dependency. Uses the History API so URLs are real.
export type Route = 'pipeline' | 'deals' | 'analytics' | 'rules' | 'settings'

const PATHS: Record<Route, string> = {
  pipeline: '/',
  deals: '/deals',
  analytics: '/analytics',
  rules: '/rules',
  settings: '/settings',
}

function currentRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const match = (Object.keys(PATHS) as Route[]).find((route) => PATHS[route] === path)
  return match ?? 'pipeline'
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, currentRoute)
}

export function pathFor(route: Route): string {
  return PATHS[route]
}

export function navigate(route: Route): void {
  if (currentRoute() === route) return
  window.history.pushState(null, '', PATHS[route])
  window.dispatchEvent(new PopStateEvent('popstate'))
}
