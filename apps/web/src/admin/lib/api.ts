import { ApiError } from './errors'
import { clearSession, getSession, type Session, setSession } from './session'

// Always relative. Production serves the site and the API from one origin, and the dev proxy in
// vite.config.ts makes development do the same, so there is no base URL to configure and no
// environment variable that can be wrong in one deployment and right in another.
const BASE = '/api'

type Envelope<T> = { success: boolean; data: T }
type AuthData = { access_token: string; admin: { id: string; email: string; created_at: string } }

// The header /api/auth/refresh and /api/auth/logout require. Without it both answer 403, so this
// is not hardening that can be skipped: it is how the panel talks to those two endpoints at all.
// See requireNonSimpleRequest in the API's internal/http/routes/public.go.
//
// Nothing but its presence is checked, and nothing more needs to be. Its whole value is that a
// browser refuses to let a page set it on a cross-origin request without a preflight first, which
// is what a page on a sibling subdomain cannot pass. Sibling subdomains matter because SameSite is
// evaluated per site, not per origin: blog.example.com is the same site as the panel, so the
// Strict refresh cookie does travel on its requests. Before this header, such a page could sign
// the admin out whenever it liked, or rotate the cookie underneath a live tab.
//
// `accept` below does not do this job and could not. Accept is a CORS-safelisted request header,
// so setting it leaves a request simple and preflight-free. X-Requested-With is not safelisted,
// which is the entire point of choosing it. The value is the old XMLHttpRequest convention
// because that is the one a reader recognises.
//
// No preflight is actually paid here: the panel and the API are one origin in both development
// (the vite.config.ts proxy) and production (the Go binary serves both).
const CSRF_HEADER = 'X-Requested-With'
const CSRF_VALUE = 'XMLHttpRequest'

/**
 * What one refresh attempt tells its caller.
 *
 * Three outcomes rather than a boolean, because two of the failures mean opposite things and a
 * caller that cannot tell them apart has to guess. `signed-out` is the refresh credential being
 * refused: the session is over and the session store has already been cleared. `unavailable` is
 * the API not answering usefully — a network drop, a 502 from a gateway, a 429 from the refresh
 * limiter, a proxy returning HTML while the service restarts. The refresh cookie is untouched and
 * very likely still good, so the session store is left exactly as it was.
 *
 * The distinction is what keeps a password prompt off an admin's screen when the server hiccups.
 * A prompt shown for a 502 teaches the reflex of retyping the admin password whenever the panel
 * misbehaves, which is precisely the reflex a phishing page is built to collect.
 */
export type RefreshOutcome = 'refreshed' | 'signed-out' | 'unavailable'

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

  // The only two statuses that say anything about the credential. A 401 is the refresh token
  // being refused; a 403 is this request being refused outright, which for this endpoint means
  // the header above did not arrive. Everything else — 429, 500, 502, 504 — is the API having a
  // bad moment, and the cookie in the browser is no worse for it.
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
    // A 200 that did not come from the handler: a tunnel, a gateway, or a proxy answering
    // text/html while the API restarts. The shape check belongs inside this try as much as the
    // parse does, because a body of `null` or `{}` parses fine and then throws a TypeError on
    // `body.data`. Letting either escape would fly straight out of `apiFetch`, past both the
    // outcome and the 401 throw, and leave the panel rendering as signed in while it holds a dead
    // token and 401s on everything it asks for.
    //
    // `unavailable`, not `signed-out`: a reply that did not come from the handler is evidence
    // about the thing in front of the API, not about the refresh cookie.
    return 'unavailable'
  }

  // Outside the try, and that is the fix rather than a tidy-up. An earlier version put this call
  // inside it, defending the choice on the grounds that unparseable and unusable are the same
  // failure — true, and now handled by building `next` in there instead. What that defence missed
  // is that `setSession` calls `emit()`, which runs every `useSyncExternalStore` subscriber
  // synchronously. Inside the try, a rendering bug anywhere in the panel shell was caught here and
  // reported as a failed refresh, sending the admin to the login screen over something that had
  // nothing to do with their session. Out here, a subscriber that throws rejects this promise and
  // reaches the error boundary as the render bug it is.
  //
  // Neither shape wedges the single flight: `.finally` below clears the slot on rejection as well
  // as on resolution.
  setSession(next)
  return 'refreshed'
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
export function refreshSession(): Promise<RefreshOutcome> {
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
 * password into a right one. The retry would 401 again for certain, having spent one of the thirty
 * refresh attempts the API allows per fifteen minutes and rotated the token for nothing.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  // On every request, not only on /auth/logout, which is the one route through here that requires
  // it. A header set in one place cannot be forgotten by the next caller added below, and the
  // API ignores it everywhere else. See the constant for why `accept` above does not cover this.
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

    // A refresh the API could not answer is not a session ending, and this throw is what stops it
    // being treated as one downstream: the leads loader turns a 401 into a redirect to the login
    // screen, so throwing 401 here would put a password prompt in front of an admin whose cookie
    // is fine. 503 is what happened as far as this caller is concerned — the API was not
    // available to renew the token — and it reaches the error boundary instead.
    //
    // No `clearSession` on either branch any more. `performRefresh` owns that decision and has
    // already made it: cleared on a refused refresh, deliberately untouched on an unavailable one.
    if (outcome === 'unavailable') throw new ApiError(503, 'unavailable', '')
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
