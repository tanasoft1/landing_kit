import {
  type ContactInput,
  contactSchema,
  type SubmitModule,
  type SubmitResult,
} from '~/submit-schema'

export async function submitContact(input: ContactInput): Promise<SubmitResult> {
  const parsed = contactSchema.safeParse(input)
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

// Drift between the two `~/submit` variants is a type error here, not a runtime surprise —
// tsconfig's `paths` only ever type-checks `~/submit` against one variant, so the other
// (KIT_SUBMIT=server) would otherwise be the one configuration nothing type-checks.
const _contract: SubmitModule = { submitContact }
void _contract
