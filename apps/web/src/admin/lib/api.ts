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
  try {
    const body = (await res.json()) as Envelope<AuthData>
    setSession({ accessToken: body.data.access_token, email: body.data.admin.email })
  } catch {
    // A 200 that did not come from the handler: a tunnel, a gateway, or a proxy answering
    // text/html while the API restarts. There is no token in it, so this is a failed refresh like
    // any other. Letting the error escape instead would fly straight out of `apiFetch`, past both
    // `clearSession` and the 401 throw, and leave the panel rendering as signed in while it holds
    // a dead token and 401s on everything it asks for.
    //
    // `setSession` is inside the try, not after it, because unparseable and unusable are the same
    // failure. A body of `null` or `{}` parses fine and then throws a TypeError on `body.data`,
    // which would escape by exactly the route the catch exists to close.
    //
    // None of this wedges the single flight: `.finally` below clears the slot on rejection as
    // well as on resolution.
    clearSession()
    return false
  }
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
 * say so. Login is one: a 401 there means the password was wrong, and no refresh turns a wrong
 * password into a right one. The retry would 401 again for certain, having spent one of the five
 * refresh attempts the API allows per fifteen minutes and rotated the token for nothing.
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

  if (!res.ok) {
    // Every 401 exit clears the session, not only the refresh-failed one above. A 401 we will not
    // retry means the credential is not working, and clearing beats rendering as signed in while
    // every request fails.
    //
    // In practice this reaches the `retry = false` callers, which today are `login` and `logout`.
    // The retry above passes `false` too, but it cannot arrive here: it carries a token minted
    // seconds earlier, and `AuthMiddleware` validates that token and looks nothing up.
    // On the login screen the session is already empty, so nothing observable changes there. The
    // line is here so the rule holds for whatever calls with `retry = false` next.
    if (res.status === 401) clearSession()
    throw await toApiError(res)
  }

  try {
    const body = (await res.json()) as Envelope<T>
    return body.data
  } catch {
    // Same case as `performRefresh`: an ok response that will not parse came from something
    // other than the handler. Callers branch on `ApiError`, so throwing one with the real status
    // keeps them on a path they have, instead of handing them a `SyntaxError` they do not.
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
