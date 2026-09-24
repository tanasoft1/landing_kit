import type { mn } from './mn'

export const en = {
  panelTitle: 'Admin',
  navLeads: 'Leads',

  signIn: 'Sign in',
  signOut: 'Sign out',
  email: 'Email',
  password: 'Password',
  signingIn: 'Signing in…',
  signInHint: 'Sign in to see the leads from your site.',

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
  noLeadsHint: "Messages sent through the site's contact form show up here.",
  previous: 'Previous',
  next: 'Next',
  close: 'Close',
} satisfies Record<keyof typeof mn, string>
