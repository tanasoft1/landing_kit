import { z } from 'zod'

/**
 * Field validation only. Timing is checked separately on purpose: one combined schema would
 * tell a fast but real human (autofill, password manager) that their correct fields are wrong,
 * and that blames the wrong thing and loses the lead.
 */
export const contactSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.email(),
  message: z.string().min(10).max(4000),
  /**
   * Honeypot. Must stay empty. Named `honeypot_url` and not something real-sounding like
   * `company`, because autofill fills recognised field names even with `autoComplete="off"` —
   * and a filled honeypot rejects a real person.
   */
  honeypot_url: z.string().max(0).optional().default(''),
})

/** Minimum time on screen before a submission is treated as human-paced. */
export const MIN_ELAPSED_MS = 2000

/**
 * What goes over the wire, validated by both submit variants.
 *
 * `elapsedMs` is required on purpose. Without it the timing check would be client-only, and a
 * bot POSTing straight at the endpoint would only have the honeypot in its way. The client
 * waits out the remainder before sending, so a fast real submission still passes.
 */
export const submissionSchema = contactSchema.extend({
  elapsedMs: z.number().int().min(MIN_ELAPSED_MS),
})

export type SubmissionInput = z.infer<typeof submissionSchema>

export type ContactInput = z.infer<typeof contactSchema>
export type SubmitResult = { ok: true } | { ok: false; error: string }

/**
 * The exact surface every `@/submit` variant must have. `tsconfig` names only one variant, so
 * without this the other is never type-checked. Same rule as `@/motion` and `@/theme`.
 */
export type SubmitModule = {
  submitContact: (input: SubmissionInput) => Promise<SubmitResult>
}
