import type { mn } from '@/admin/i18n/mn'

type MessageKey = Extract<keyof typeof mn, `err${string}`>

/**
 * API error codes to panel strings.
 *
 * The API answers `{error, message}` where `message` is Mongolian prose written for an operator
 * and `error` is a stable machine code. The panel switches on the code, because rendering
 * `message` directly would put Mongolian text on the screen of someone who has set the panel to
 * English.
 *
 * `invalid token` maps to the session-expired string rather than a token one. From the outside a
 * dead refresh token and an expired session are the same event, and "your session expired" is
 * what tells someone what to do about it.
 */
const BY_CODE: Record<string, MessageKey> = {
  'invalid credentials': 'errInvalidCredentials',
  'rate limited': 'errRateLimited',
  unauthorized: 'errUnauthorized',
  'invalid token': 'errUnauthorized',
  'validation error': 'errUnknown',
  'internal error': 'errUnknown',
  network: 'errNetwork',
  // Not a code the API sends. `apiFetch` raises it when a refresh could not be completed because
  // the API did not answer usefully, and it maps to the network string on purpose: from the
  // admin's side a gateway that swallowed the refresh and a connection that dropped are the same
  // event, and neither is a reason to ask them for their password.
  unavailable: 'errNetwork',
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly serverMessage: string,
  ) {
    super(`${status} ${code}`)
    this.name = 'ApiError'
  }

  /**
   * The string to show. Falls back to the server's own message for an unrecognised code, which
   * may be Mongolian in an English panel — deliberately, because a real description of what went
   * wrong beats a generic one, and an unmapped code is a bug to fix rather than a state to
   * design around.
   */
  messageFor(t: typeof mn): string {
    const key = BY_CODE[this.code]
    if (key !== undefined) return t[key]
    return this.serverMessage !== '' ? this.serverMessage : t.errUnknown
  }
}
