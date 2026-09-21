import { useLanguage } from '@/admin/lib/language'
import { en } from './en'
import { mn } from './mn'

const DICTIONARIES = { mn, en }

/**
 * Returns the active dictionary, so callers write `t.signIn` rather than `t('signIn')`.
 *
 * An object rather than a lookup function on purpose: both dictionaries are module-level
 * constants, so the returned reference is stable until the language changes and a component that
 * memoises on `t` is not invalidated on every render.
 */
export function useT(): typeof mn {
  return DICTIONARIES[useLanguage()]
}
