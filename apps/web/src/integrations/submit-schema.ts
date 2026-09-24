import { z } from 'zod'

// Fields only. Timing is checked separately so a fast human never sees "your fields are wrong".
export const contactSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.email(),
  message: z.string().min(10).max(4000),
  // Honeypot, must stay empty. Don't rename it to a real-sounding field: autofill would fill it.
  honeypot_url: z.string().max(0).optional().default(''),
})

export const MIN_ELAPSED_MS = 2000

// `elapsedMs` is required so the server also checks timing, not only the client.
export const submissionSchema = contactSchema.extend({
  elapsedMs: z.number().int().min(MIN_ELAPSED_MS),
})

export type SubmissionInput = z.infer<typeof submissionSchema>

export type ContactInput = z.infer<typeof contactSchema>
export type SubmitResult = { ok: true } | { ok: false; error: string }

// What `@/submit` must export.
export type SubmitModule = {
  submitContact: (input: SubmissionInput) => Promise<SubmitResult>
}
