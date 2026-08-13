// Registers every block's components synchronously, before any request is handled — see
// `variants.all.ts`'s header comment. Side-effect import, kept first and deliberately not
// re-exported: nothing here should give the client entry a path to reach this module.
import '~/blocks/variants.all'
import type { Register } from '@tanstack/react-router'
import type { RequestHandler } from '@tanstack/react-start/server'
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'

// Overrides `@tanstack/react-start`'s generated server entry — a supported override, resolved by
// filename convention (`resolveEntry` in `@tanstack/start-plugin-core`), same mechanism as
// `src/client.tsx`. Body copied verbatim from the installed version's default entry
// (`default-entry/server.ts`); the only addition is the side-effect import above.

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
