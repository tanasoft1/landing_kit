import {
  type SubmissionInput,
  type SubmitModule,
  type SubmitResult,
  submissionSchema,
} from '@/integrations/submit-schema'

export async function submitContact(input: SubmissionInput): Promise<SubmitResult> {
  // Same schema the RPC variant validates, so neither mode is the weaker one.
  const parsed = submissionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const endpoint = import.meta.env.VITE_CONTACT_ENDPOINT
  if (!endpoint) return { ok: false, error: 'missing-endpoint' }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: parsed.data.name,
        email: parsed.data.email,
        message: parsed.data.message,
      }),
    })
    return res.ok ? { ok: true } : { ok: false, error: `http-${res.status}` }
  } catch {
    return { ok: false, error: 'network' }
  }
}

// Type-checks this file against the shared `@/submit` surface, so the two variants cannot drift
// apart. `tsconfig` points `@/submit` at one variant only, so without this line the other one
// (`KIT_SUBMIT=server`) is the setup nothing type-checks.
const _contract: SubmitModule = { submitContact }
void _contract
