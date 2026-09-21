import { useSyncExternalStore } from 'react'

export type Session = {
  accessToken: string | null
  email: string | null
}

/**
 * A single frozen empty value, not a fresh object each time.
 *
 * Single, because `useSyncExternalStore` compares snapshots with `Object.is` and re-renders when
 * they differ. For an object that is a reference comparison, so a getter that built
 * `{ accessToken: null, email: null }` on every call would hand React a new reference every time
 * it checked. React 19 warns that `getSnapshot` should be cached and then throws "Maximum update
 * depth exceeded".
 *
 * Frozen, because both `state` and `clearSession` point at this one object. Without the freeze a
 * caller that wrote `session.accessToken = 'x'` would corrupt the empty session for every
 * consumer that reads it afterwards.
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
  // Iterate a copy, not the live Set. A listener that unsubscribes and resubscribes inside its own
  // handler is visited again by a live-Set iteration and spins. Nothing does that today, because
  // React schedules work rather than resubscribing from a notification; the copy is what keeps
  // that from becoming a hang if a non-React subscriber ever does.
  for (const listener of [...listeners]) listener()
}

export function getSession(): Session {
  return state
}

/**
 * The snapshot React uses when it server-renders, and again on the client when it hydrates.
 *
 * Not only a server concern, which is why this cannot be deleted as a duplicate of `getSession`.
 * React calls `getServerSnapshot` for the hydrating render too, so this is what guarantees the
 * panel's first client render is empty whatever `state` already holds. On the server it matters
 * for a second reason: `state` is module-level, so one process shares it across every render it
 * performs, and a getter reading it would leak one request's session into another's HTML.
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
