import { useSyncExternalStore } from 'react'

export type Session = {
  accessToken: string | null
  email: string | null
}

// One shared object: useSyncExternalStore loops forever if the snapshot is a new object each call.
// Frozen, because everyone shares it.
const EMPTY: Session = Object.freeze({ accessToken: null, email: null })

// Memory only. Never put the access token in storage or a readable cookie, where an injected
// script could steal it. A reload refreshes from the HttpOnly cookie.
let state: Session = EMPTY

const listeners = new Set<() => void>()

function emit(): void {
  // Iterate a copy. A listener that resubscribes during a live-Set loop would spin forever.
  for (const listener of [...listeners]) listener()
}

export function getSession(): Session {
  return state
}

// Not a duplicate of getSession. React also uses it for hydration, and on the server a
// module-level `state` would leak one request's session into another's HTML.
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

export function useSession(): Session {
  return useSyncExternalStore(subscribeSession, getSession, getServerSession)
}
