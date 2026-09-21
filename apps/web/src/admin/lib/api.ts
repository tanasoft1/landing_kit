import { ApiError } from './errors'
import { clearSession, getSession, setSession } from './session'

// Always relative. Production serves the site and the API from one origin, and the dev proxy in
// vite.config.ts makes development do the same, so there is no base URL to configure and no
// environment variable that can be wrong in one deployment and right in another.
const BASE = '/api'

type Envelope<T> = { success: boolean; data: T }
type AuthData = { access_token: string; admin: { id: string; email: string; created_at: string } }

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: string; message?: string }
    return new ApiError(res.status, body.error ?? 'unknown', body.message ?? '')
  } catch {
    // A non-JSON body means something between us and the handler answered: a proxy, a gateway,
    // or the dev server with the API down. The status is all there is to go on.
    return new ApiError(res.status, 'unknown', '')
  }
}

let refreshInFlight: Promise<boolean> | null = null

async function performRefresh(): Promise<boolean> {
  let res: Response
  try {
    res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' })
  } catch {
    return false
  }
  if (!res.ok) {
    clearSession()
    return false
  }
  const body = (await res.json()) as Envelope<AuthData>
  setSession({ accessToken: body.data.access_token, email: body.data.admin.email })
  return true
}

/**
 * Refreshes the access token, at most once at a time.
 *
 * The shared promise is not merely tidy. Refresh tokens rotate and the server treats a token
 * presented twice as a replay, revoking the whole family (see the API's service/auth Refresh).
 * Two requests that 401 together and each fired their own refresh would send the same cookie
 * twice, and the second would look exactly like a stolen token being reused — logging the admin
 * out and writing a token_reuse_detected row about an attack that never happened.
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

/**
 * Calls the API and returns the unwrapped `data`.
 *
 * `retry` exists so the 401 path cannot recurse forever, and so callers who must not retry can
 * say so. Login is one: a 401 there means the password was wrong, and refreshing in response
 * would be answering an authentication failure with a credential the caller does not have.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
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
    if (await refreshSession()) return apiFetch<T>(path, init, false)
    clearSession()
    throw new ApiError(401, 'unauthorized', '')
  }

  if (!res.ok) throw await toApiError(res)

  const body = (await res.json()) as Envelope<T>
  return body.data
}

export async function login(email: string, password: string): Promise<void> {
  const data = await apiFetch<AuthData>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
    false,
  )
  setSession({ accessToken: data.access_token, email: data.admin.email })
}

/**
 * Signs out. The local session is cleared whether or not the server call succeeded: leaving a
 * token in memory after someone clicked Sign out is the wrong way to fail, and the server's own
 * logout answers 200 regardless anyway.
 */
export async function logout(): Promise<void> {
  try {
    await apiFetch<unknown>('/auth/logout', { method: 'POST' }, false)
  } catch {
    // Nothing useful to do. The cookie may survive until it expires; the family revocation is
    // best effort from here.
  } finally {
    clearSession()
  }
}
