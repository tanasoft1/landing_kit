import type { mn } from '@/admin/i18n/mn'

type MessageKey = Extract<keyof typeof mn, `err${string}`>

// Map the API's stable `error` code, not its `message`, which is always Mongolian.
const BY_CODE: Record<string, MessageKey> = {
  'invalid credentials': 'errInvalidCredentials',
  'rate limited': 'errRateLimited',
  unauthorized: 'errUnauthorized',
  'invalid token': 'errUnauthorized',
  'validation error': 'errUnknown',
  'internal error': 'errUnknown',
  network: 'errNetwork',
  // Raised by apiFetch, not the API, when a refresh got no useful answer.
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

  // An unknown code falls back to the server's Mongolian message on purpose. Map the code.
  messageFor(t: typeof mn): string {
    const key = BY_CODE[this.code]
    if (key !== undefined) return t[key]
    return this.serverMessage !== '' ? this.serverMessage : t.errUnknown
  }
}
