import { createServerFn } from '@tanstack/react-start'
import {
  type SubmissionInput,
  type SubmitModule,
  type SubmitResult,
  submissionSchema,
} from '@/submit-schema'

// Deliberately named `.rpc.ts`, not `.server.ts` — see the `~/submit` alias comment in
// vite.config.ts for why. Do NOT rename this back to `submit.server.ts` and do NOT re-add an
// `importProtection.client.excludeFiles` entry: that would silently disable the guard for every
// other file too. If real server-only secrets or logic land here, split them into a separate
// `*.server.ts` file that this module imports instead.

const handler = createServerFn({ method: 'POST' })
  // Revalidates server-side, including the timing minimum — the client can be bypassed.
  .validator((data: unknown) => submissionSchema.parse(data))
  .handler(async ({ data }): Promise<SubmitResult> => {
    console.log('[contact]', data.name, data.email)
    // Wire an email provider here per project.
    return { ok: true }
  })

export async function submitContact(input: SubmissionInput): Promise<SubmitResult> {
  try {
    return await handler({ data: input })
  } catch {
    return { ok: false, error: 'server' }
  }
}

// Drift between the two `~/submit` variants is a type error here, not a runtime surprise —
// tsconfig's `paths` only ever type-checks `~/submit` against one variant, so the other
// (KIT_SUBMIT=server) would otherwise be the one configuration nothing type-checks.
const _contract: SubmitModule = { submitContact }
void _contract
