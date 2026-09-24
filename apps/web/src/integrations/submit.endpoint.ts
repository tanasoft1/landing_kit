import {
  type SubmissionInput,
  type SubmitModule,
  type SubmitResult,
  submissionSchema,
} from '@/integrations/submit-schema'

export async function submitContact(input: SubmissionInput): Promise<SubmitResult> {
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
        // Do not drop these two. The server needs them to catch bots that skip the client.
        honeypot_url: parsed.data.honeypot_url,
        elapsed_ms: parsed.data.elapsedMs,
        // snake_case to match the API.
        locale: document.documentElement.lang || undefined,
        source_page: window.location.pathname,
      }),
    })
    return res.ok ? { ok: true } : { ok: false, error: `http-${res.status}` }
  } catch {
    return { ok: false, error: 'network' }
  }
}

// Checks every export against the shared type. Callers only check what they import.
const _contract: SubmitModule = { submitContact }
void _contract
