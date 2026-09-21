import { useSyncExternalStore } from 'react'
import { site } from '@/config/site.config'

export type PanelLanguage = 'mn' | 'en'

const STORAGE_KEY = 'kit-admin-lang'

/** Narrows a value of unknown provenance to a language the panel has a dictionary for. */
const isLanguage = (value: unknown): value is PanelLanguage => value === 'mn' || value === 'en'

/**
 * The default, used for the very first render on both the server and the client.
 *
 * Deliberately NOT read from localStorage here. The panel's first HTML is produced where no
 * browser storage exists — per request on the server, or at build time once the panel is
 * prerendered — so a module that initialised itself from storage would put one language in that
 * HTML and possibly another once the client took over, and React would report a hydration
 * mismatch. Neither rendering mode escapes it, which is why this says nothing about which one is
 * in use. `loadStoredLanguage` below applies the stored preference after mount instead, which
 * costs at most one frame in the wrong language.
 *
 * Assigned straight from the config, with no guard. `PanelLanguage` and `Locale` are separate
 * types answering different questions, but they hold the same members, so a project that widens
 * `Locale` gets a type error on this line — `Locale` is no longer assignable to `PanelLanguage`,
 * which is the panel saying it has no dictionary for the new language. That is the point. It
 * fails loudly alongside the other "add your new locale" errors that widening raises across the
 * blocks and page configs, rather than silently falling back to Mongolian with no signal.
 */
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
    // Private browsing, a full quota, or storage disabled. The panel still works in the chosen
    // language for this tab; only remembering it fails, and that is not worth an error to a user
    // who just clicked a language toggle.
  }
  // Iterate a copy. See the note in session.ts's emit.
  for (const listener of [...listeners]) listener()
}

/**
 * Applies the stored preference. Call once, from an effect after mount.
 *
 * Split from module initialisation so the first render is identical on the server and the
 * client. See the comment on `state` above.
 *
 * `isLanguage` is load-bearing here, and only here. `localStorage.getItem` returns
 * `string | null` and no type can promise more, because the value was written by an earlier
 * version of this code on someone's machine. Suppose a project adds a third locale with a
 * dictionary, a user picks it, and `kit-admin-lang` now holds that value; the project later drops
 * the locale. The next load reads the stale value back, `DICTIONARIES[stale]` is `undefined`, and
 * the first `t.panelTitle` throws. The guard turns that into the default language. Storage is the
 * untrusted input, not site.config.ts.
 */
export function loadStoredLanguage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(stored) && stored !== state) {
      state = stored
      for (const listener of [...listeners]) listener()
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
