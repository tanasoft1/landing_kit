import { useSyncExternalStore } from 'react'

export type Session = {
  accessToken: string | null
  email: string | null
}

/**
 * A single frozen empty value, not a fresh object each time.
 *
 * `useSyncExternalStore` compares snapshots by reference and re-renders when they differ. A
 * getter that built `{ accessToken: null, email: null }` on every call would return a new
 * reference every time React checked, which React reads as "changed again" and loops forever.
 */
const EMPTY: Session = Object.freeze({ accessToken: null, email: null })

// In memory for the life of the tab, and nowhere else.
//
// Not localStorage, not sessionStorage, not a cookie this script can read. The refresh token is
// an HttpOnly cookie the browser will not show us (see the API's handlers/auth/cookie.go), and
// putting the access token somewhere readable would hand an injected script the one credential
// that design withholds. A reload starts empty and calls refresh once, which costs a round trip
// and leaves nothing behind for an attacker to find later.
let state: Session = EMPTY

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function getSession(): Session {
  return state
}

/**
 * The snapshot React uses while server-rendering.
 *
 * Separate from `getSession` and always empty, because `state` is module-level and a server
 * process shares it across every render it performs. Today `/admin` is prerendered once with no
 * session, so the two would agree anyway; this keeps them agreeing if the panel is ever rendered
 * per request.
 */
function getServerSession(): Session {
  return EMPTY
}

export function setSession(next: Session): void {
  state = next
  emit()
}

export function clearSession(): void {
  state = EMPTY
  emit()
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The React view of the session. Re-renders the caller whenever it changes. */
export function useSession(): Session {
  return useSyncExternalStore(subscribeSession, getSession, getServerSession)
}
