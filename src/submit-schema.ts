import { z } from 'zod'

/**
 * Field validation only. Timing is checked separately, deliberately: folding both into one
 * schema would tell a genuinely fast human (autofill, password manager) their correct fields
 * are wrong — misattributing the cause loses the lead.
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
 * What goes over the wire, validated by both submit variants.
 *
 * `elapsedMs` required, deliberately: without it the timing guard would be client-only, and a
 * bot script POSTing straight at the endpoint would sail through with only the honeypot in its
 * way. The client computes it after waiting out any remainder, so a real fast submission still passes.
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
