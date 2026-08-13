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

/**
 * What actually goes over the wire, and what BOTH submit variants validate.
 *
 * `elapsedMs` is required here, deliberately. Splitting it out of `contactSchema` above fixed a
 * real bug — a fast human was told their correct fields were wrong — but dropping it from
 * validation altogether would have left the timing guard purely client-side, where a bot never
 * runs it. A naive script POSTing `{name, email, message}` straight at the endpoint would then
 * sail through with only the honeypot standing in its way.
 *
 * Keeping it required restores that: the client computes `elapsedMs` *after* waiting out any
 * remainder, so a genuine fast submission passes, while a request that never ran the form is
 * rejected for a missing field.
 */
export const submissionSchema = contactSchema.extend({
  elapsedMs: z.number().int().min(MIN_ELAPSED_MS),
})

export type SubmissionInput = z.infer<typeof submissionSchema>

export type ContactInput = z.infer<typeof contactSchema>
export type SubmitResult = { ok: true } | { ok: false; error: string }

/**
 * Every `@/submit` variant must satisfy this exact surface. `tsconfig` `paths` names only one
 * variant, so without this the other is never type-checked and the swapped configuration
 * becomes the one nobody verifies. Same rule as `@/motion` and `@/theme`.
 */
export type SubmitModule = {
  submitContact: (input: SubmissionInput) => Promise<SubmitResult>
}
