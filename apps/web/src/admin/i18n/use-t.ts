import { useLanguage } from '@/admin/lib/language'
import { en } from './en'
import { mn } from './mn'

const DICTIONARIES = { mn, en }

// Returns a stable object, so memoising on `t` only reruns when the language changes.
export function useT(): typeof mn {
  return DICTIONARIES[useLanguage()]
}
