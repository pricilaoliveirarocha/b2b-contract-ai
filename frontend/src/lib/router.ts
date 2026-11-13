import { useSyncExternalStore } from 'react'

// Tiny router: two pages don't justify a dependency. Uses the History API so URLs are real (/deals).
export type Route = 'pipeline' | 'deals'

const PATHS: Record<Route, string> = { pipeline: '/', deals: '/deals' }

function currentRoute(): Route {
  return window.location.pathname.replace(/\/+$/, '') === PATHS.deals ? 'deals' : 'pipeline'
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
