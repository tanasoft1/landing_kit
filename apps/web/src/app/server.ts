// Registers every block's components before any request is handled — see `variants.all.ts`'s
// header comment. A side-effect import, kept first and never re-exported, so the client entry
// has no path to reach this module.
import '@/blocks/variants.all'
import type { Register } from '@tanstack/react-router'
import type { RequestHandler } from '@tanstack/react-start/server'
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'

// Replaces the server entry `@tanstack/react-start` would generate — a supported override,
// picked up by filename, the same way as `src/app/client.tsx`. The body is copied straight from
// the installed default entry (`default-entry/server.ts`); the only addition is the import above.

const fetch = createStartHandler(defaultStreamHandler)

export type ServerEntry = { fetch: RequestHandler<Register> }

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(...args) {
      return await entry.fetch(...args)
    },
  }
}

export default createServerEntry({ fetch })
