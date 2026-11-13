import { useSyncExternalStore } from 'react'
import { pathFor, type Route } from './router'

// App preferences, kept in this browser only (localStorage). The language has its own key
// (see I18nProvider) because it was there first.
export type HomePage = Extract<Route, 'pipeline' | 'deals' | 'analytics'>
export type Density = 'auto' | 'compact'

export interface Preferences {
  homePage: HomePage
  density: Density
}

export const HOME_PAGES: HomePage[] = ['pipeline', 'deals', 'analytics']
const DEFAULTS: Preferences = { homePage: 'pipeline', density: 'auto' }
const STORAGE_KEY = 'b2b-contract-ai:preferences'

function load(): Preferences {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (raw && typeof raw === 'object') {
      const saved = raw as Partial<Preferences>
      // Accept only known values, so a corrupted or edited entry can't break the app.
      return {
        homePage: HOME_PAGES.includes(saved.homePage as HomePage) ? (saved.homePage as HomePage) : DEFAULTS.homePage,
        density: saved.density === 'compact' ? 'compact' : 'auto',
      }
    }
  } catch {
    // Unreadable storage or invalid JSON: fall back to the defaults.
  }
  return DEFAULTS
}

let current = load()
const listeners = new Set<() => void>()

export function updatePreferences(changes: Partial<Preferences>): void {
  current = { ...current, ...changes }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Not critical: the choice just won't be remembered.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, () => current)
}

/** On launch, open the chosen start page instead of the pipeline (only when opening the bare address). */
export function applyStartPage(): void {
  if (window.location.pathname === '/' && current.homePage !== 'pipeline') {
    window.history.replaceState(null, '', pathFor(current.homePage))
  }
}
