import { createServerFn } from '@tanstack/react-start'
import {
  type SubmissionInput,
  type SubmitModule,
  type SubmitResult,
  submissionSchema,
} from '@/integrations/submit-schema'

// Named `.rpc.ts` on purpose: the client imports it, and `.server.ts` files are blocked there.
// Don't rename it or add an import-protection exclude. Put real secrets in a `*.server.ts` file.

const handler = createServerFn({ method: 'POST' })
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

// Checks every export against the shared type. Callers only check what they import.
const _contract: SubmitModule = { submitContact }
void _contract
