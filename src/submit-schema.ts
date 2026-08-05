import { z } from 'zod'

/**
 * Field validation only. Timing is checked separately and deliberately NOT folded in here:
 * a single schema covering both means a genuinely fast human — someone using autofill or a
 * password manager — is told "please complete every field correctly" when every field is in
 * fact correct. Misattributing the cause on a lead-capture form loses the lead.
 */
export const contactSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.email(),
  message: z.string().min(10).max(4000),
  /**
   * Honeypot — must stay empty. Named `honeypot_url` rather than a plausible real field like
   * `company`, because autofill matches recognised field names even with `autoComplete="off"`,
   * and an autofilled honeypot rejects a genuine submission.
   */
  honeypot_url: z.string().max(0).optional().default(''),
})

/** Minimum time on screen before a submission is treated as human-paced. */
export const MIN_ELAPSED_MS = 2000

export type ContactInput = z.infer<typeof contactSchema>
export type SubmitResult = { ok: true } | { ok: false; error: string }

/**
 * Every `~/submit` variant must satisfy this exact surface. `tsconfig` `paths` names only one
 * variant, so without this the other is never type-checked and the swapped configuration
 * becomes the one nobody verifies. Same rule as `~/motion` and `~/theme`.
 */
export type SubmitModule = {
  submitContact: (input: ContactInput) => Promise<SubmitResult>
}
