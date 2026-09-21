import { useSyncExternalStore } from 'react'
import { site } from '@/config/site.config'

export type PanelLanguage = 'mn' | 'en'

const STORAGE_KEY = 'kit-admin-lang'

/**
 * Narrows to a language the panel actually has a dictionary for.
 *
 * Not redundant, even though `site.defaultLocale` is typed `Locale` and `Locale` is the same
 * union as `PanelLanguage` today. The two types answer different questions: `PanelLanguage` is
 * the set of languages the panel ships strings for, `Locale` is the set of languages the site is
 * published in. They coincide by accident, not by rule. A project that adds a third locale
 * widens `Locale` and, without this guard, would hand `useT` a key `DICTIONARIES` has no entry
 * for — a crash at the first render of the panel. Keep the guard and its `'mn'` fallback, and do
 * not merge the two types.
 */
const isLanguage = (value: unknown): value is PanelLanguage => value === 'mn' || value === 'en'

/**
 * The default, used for the very first render on both the server and the client.
 *
 * Deliberately NOT read from localStorage here. The panel shell is prerendered, so a module that
 * initialised itself from storage would render one language on the server and possibly another
 * on the client, and React would report a hydration mismatch. `loadStoredLanguage` below applies
 * the stored preference after mount instead, which costs at most one frame in the wrong language.
 */
let state: PanelLanguage = isLanguage(site.defaultLocale) ? site.defaultLocale : 'mn'

const listeners = new Set<() => void>()

export function getLanguage(): PanelLanguage {
  return state
}

export function setLanguage(next: PanelLanguage): void {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Private browsing, a full quota, or storage disabled. The panel still works in the chosen
    // language for this tab; only remembering it fails, and that is not worth an error to a user
    // who just clicked a language toggle.
  }
  for (const listener of listeners) listener()
}

/**
 * Applies the stored preference. Call once, from an effect after mount.
 *
 * Split from module initialisation so the first render is identical on the server and the
 * client. See the comment on `state` above.
 */
export function loadStoredLanguage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(stored) && stored !== state) {
      state = stored
      for (const listener of listeners) listener()
    }
  } catch {
    // Same reasoning as setLanguage: unreadable storage means the default, not a failure.
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
