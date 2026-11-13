import { useSyncExternalStore } from 'react'
import { ApiError, apiGet } from './api'

// The administrator key unlocks creating, editing and deleting rules. It lives in sessionStorage:
// it disappears when the tab is closed and is never written to localStorage. The real check is
// always done by the server; this only remembers what to send.
const STORAGE_KEY = 'b2b-contract-ai:admin-token'

function read(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null // storage can be blocked; the key then only lives in memory
  }
}

let token: string | null = read()
const listeners = new Set<() => void>()

export function getAdminToken(): string | null {
  return token
}

export function setAdminToken(next: string | null): void {
  token = next
  try {
    if (next) sessionStorage.setItem(STORAGE_KEY, next)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Not critical: the key just won't survive a reload.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current administrator key, or null when not signed in as administrator. */
export function useAdminToken(): string | null {
  return useSyncExternalStore(subscribe, getAdminToken)
}

export type AdminCheck = 'ok' | 'invalid' | 'disabled' | 'unreachable'

/** Asks the server whether this key is valid, before showing administrator tools. */
export async function checkAdminToken(candidate: string): Promise<AdminCheck> {
  try {
    await apiGet('/admin/session', undefined, candidate)
    return 'ok'
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) return 'invalid'
      if (error.status === 403) return 'disabled'
    }
    return 'unreachable'
  }
}
