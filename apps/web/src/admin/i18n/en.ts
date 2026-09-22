import type { mn } from './mn'

/**
 * `satisfies Record<keyof typeof mn, string>` rather than a plain object.
 *
 * A key added to mn.ts and forgotten here is then a type error on this line, instead of a blank
 * label nobody notices until someone switches the panel to English.
 */
export const en = {
  panelTitle: 'Admin',
  navLeads: 'Leads',

  signIn: 'Sign in',
  signOut: 'Sign out',
  email: 'Email',
  password: 'Password',
  signingIn: 'Signing in…',

  fieldEmailInvalid: 'Enter a valid email address',
  fieldPasswordRequired: 'Enter your password',

  errInvalidCredentials: 'Email or password is incorrect',
  errRateLimited: 'Too many attempts. Wait a moment and try again.',
  errUnauthorized: 'Your session expired. Please sign in again.',
  errNetwork: 'Could not reach the server',
  errUnknown: 'Something went wrong. Please try again.',

  leadsTitle: 'Leads',
  colDate: 'Date',
  colName: 'Name',
  colEmail: 'Email',
  colLocale: 'Language',
  colSource: 'Page',
  colMessage: 'Message',
  rowActions: 'Actions',
  copyEmail: 'Copy email',
  openMail: 'Write email',
  viewLead: 'View',
  emailCopied: 'Email copied',

  noLeads: 'No leads yet',
  previous: 'Previous',
  next: 'Next',
} satisfies Record<keyof typeof mn, string>
