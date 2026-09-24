import { ApiError } from './errors'
import { clearSession, getSession, type Session, setSession } from './session'

// Always relative. The site and the API share one origin in production, and the dev proxy
// does the same in development.
const BASE = '/api'

type Envelope<T> = { success: boolean; data: T }
type AuthData = { access_token: string; admin: { id: string; email: string; created_at: string } }

// Required by /auth/refresh and /auth/logout, which answer 403 without it. It is CSRF defence:
// a browser will not let a cross-origin page (even a sibling subdomain) set it without a preflight.
// Do not swap it for a safelisted header like Accept; those never trigger a preflight.
const CSRF_HEADER = 'X-Requested-With'
const CSRF_VALUE = 'XMLHttpRequest'

// `signed-out`: the server refused the refresh cookie, and the session is already cleared.
// `unavailable`: the API did not answer usefully (network, 429, 502). The cookie is probably fine,
// so keep the session and do not show a password prompt.
export type RefreshOutcome = 'refreshed' | 'signed-out' | 'unavailable'

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: string; message?: string }
    return new ApiError(res.status, body.error ?? 'unknown', body.message ?? '')
  } catch {
    // Not JSON: a proxy or gateway answered, not the API.
    return new ApiError(res.status, 'unknown', '')
  }
}

let refreshInFlight: Promise<RefreshOutcome> | null = null

async function performRefresh(): Promise<RefreshOutcome> {
  let res: Response
  try {
    res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { [CSRF_HEADER]: CSRF_VALUE },
    })
  } catch {
    return 'unavailable'
  }

  // Only 401 and 403 say the credential is bad. Any other failure is the API having a bad moment.
  if (res.status === 401 || res.status === 403) {
    clearSession()
    return 'signed-out'
  }
  if (!res.ok) return 'unavailable'

  let next: Session
  try {
    const body = (await res.json()) as Envelope<AuthData>
    next = { accessToken: body.data.access_token, email: body.data.admin.email }
  } catch {
    // A 200 from a proxy, not the API. Building `next` stays inside the try because `null` or `{}`
    // parse fine and then throw on `body.data`.
    return 'unavailable'
  }

  // Keep this outside the try. setSession runs every subscriber synchronously, and a render bug
  // caught here would look like a failed refresh and send the admin to the login screen.
  setSession(next)
  return 'refreshed'
}

// One refresh at a time. Refresh tokens rotate, and the server treats a token sent twice as
// stolen and signs the admin out. Two parallel refreshes would trigger that.
export function refreshSession(): Promise<RefreshOutcome> {
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

// Pass `retry = false` where a 401 must not trigger a refresh. Login is one: a 401 there means a
// wrong password, and a refresh would only burn a rate-limited attempt.
export async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  // Sent on every request so a new caller cannot forget it. The API ignores it on other routes.
  headers.set(CSRF_HEADER, CSRF_VALUE)
  if (init.body !== undefined) headers.set('content-type', 'application/json')

  const { accessToken } = getSession()
  if (accessToken !== null) headers.set('authorization', `Bearer ${accessToken}`)

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'network', '')
  }

  if (res.status === 401 && retry) {
    const outcome = await refreshSession()
    if (outcome === 'refreshed') return apiFetch<T>(path, init, false)

    // 503, not 401: loaders redirect a 401 to the login screen, and the cookie may still be fine.
    // performRefresh has already decided whether to clear the session.
    if (outcome === 'unavailable') throw new ApiError(503, 'unavailable', '')
    throw new ApiError(401, 'unauthorized', '')
  }

  if (!res.ok) {
    // A 401 we will not retry means the credential is dead. Clear it rather than look signed in.
    if (res.status === 401) clearSession()
    throw await toApiError(res)
  }

  try {
    const body = (await res.json()) as Envelope<T>
    return body.data
  } catch {
    // A proxy answered. Throw ApiError, since callers only handle that, not SyntaxError.
    throw new ApiError(res.status, 'unknown', '')
  }
}

export async function login(email: string, password: string): Promise<void> {
  const data = await apiFetch<AuthData>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
    false,
  )
  setSession({ accessToken: data.access_token, email: data.admin.email })
}

// Clears the local session even if the server call fails.
export async function logout(): Promise<void> {
  try {
    await apiFetch<unknown>('/auth/logout', { method: 'POST' }, false)
  } catch {
    // Best effort. The cookie may live until it expires.
  } finally {
    clearSession()
  }
}
