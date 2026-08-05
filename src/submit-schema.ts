import { z } from 'zod'

export const contactSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.email(),
  message: z.string().min(10).max(4000),
  /** Honeypot — must stay empty. */
  company: z.string().max(0).optional().default(''),
  /** Milliseconds the form was on screen before submit. */
  elapsedMs: z.number().int().min(2000),
})

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
