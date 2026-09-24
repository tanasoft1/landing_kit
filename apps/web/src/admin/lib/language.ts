import { useSyncExternalStore } from 'react'
import { site } from '@/config/site.config'

export type PanelLanguage = 'mn' | 'en'

const STORAGE_KEY = 'kit-admin-lang'

const isLanguage = (value: unknown): value is PanelLanguage => value === 'mn' || value === 'en'

// Do not read localStorage here: the server has none, and the first render must match it or
// hydration fails. loadStoredLanguage applies it after mount.
// Adding a locale makes this line a type error until the panel gets a dictionary for it.
let state: PanelLanguage = site.defaultLocale

const listeners = new Set<() => void>()

export function getLanguage(): PanelLanguage {
  return state
}

export function setLanguage(next: PanelLanguage): void {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage blocked. The choice still applies to this tab.
  }
  for (const listener of [...listeners]) listener()
}

// Call once, from an effect after mount. Keep the isLanguage check: storage may hold a language
// this build no longer has a dictionary for.
export function loadStoredLanguage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(stored) && stored !== state) {
      state = stored
      for (const listener of [...listeners]) listener()
    }
  } catch {
    // Unreadable storage means the default.
  }
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLanguage(): PanelLanguage {
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage)
}
