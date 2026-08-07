// Namespace import, not named (`import { existsSync, readFileSync } from 'node:fs'`): Vite's
// client-build externalization of node builtins produces a stub module with NO named exports at
// all, so a named import fails Rollup's static binding check at parse time — before the
// `import.meta.env.SSR` dead-branch elimination below ever gets a chance to remove the usage. A
// namespace import defers the property lookup (`nodeFs.existsSync`) to a plain runtime member
// access, which Rollup does not statically validate, so the client build resolves cleanly; the
// access itself is still never reached there once the dead branch is stripped.
import * as nodeFs from 'node:fs'
import type { BlockId } from '~/blocks/registry'

type ManifestChunk = {
  file: string
  isEntry?: boolean
  imports?: string[]
}

type ViteManifest = Record<string, ManifestChunk>

// Cached across calls within one process: prerendering renders every page from a single Node
// process, and the manifest is immutable once the client build has finished.
let manifestCache: ViteManifest | null | undefined

function loadManifest(): ViteManifest | null {
  if (manifestCache !== undefined) return manifestCache
  const manifestPath = 'dist/client/.vite/manifest.json'
  if (!nodeFs.existsSync(manifestPath)) {
    // `pnpm dev` runs this same server code path with no client build on disk at all — a
    // missing manifest is the normal case there, not an error.
    manifestCache = null
    return manifestCache
  }
  try {
    manifestCache = JSON.parse(nodeFs.readFileSync(manifestPath, 'utf8')) as ViteManifest
  } catch {
    manifestCache = null
  }
  return manifestCache
}

/**
 * Server-only. Root-relative hrefs for the `<link rel="modulepreload">` entries a page needs, so
 * its block chunks — and anything THEY statically import, e.g. the shared `motion` chunk that
 * hero/features/cta variants all pull in — fetch in parallel with the main chunk instead of being
 * discovered only after it has downloaded *and executed*. Each undiscovered hop is a full round
 * trip under Lighthouse's throttled-mobile network model, which is what `src/client.tsx`'s
 * pre-hydration `await` was paying for without this.
 *
 * Guarded by `import.meta.env.SSR`, NOT a `.server.ts` filename: this module is reachable from
 * `build-head.ts`, which is shared route code (TanStack Router re-evaluates a route's `head()` on
 * client-side navigation too, not just on the server), so it cannot use the harder
 * import-protection guard without failing the client build outright. On the client this returns
 * `[]` before touching `node:fs` — Vite replaces `import.meta.env.SSR` with the literal `false`
 * there, so the whole branch (`node:fs` included) is dead code and gets stripped; confirmed
 * empirically (see task report) that neither `node:fs` nor this function's body survives in the
 * client bundle.
 */
export function blockPreloadHrefs(blockIds: readonly BlockId[]): string[] {
  if (!import.meta.env.SSR) return []

  const manifest = loadManifest()
  if (!manifest) return []

  const files = new Set<string>()
  const visited = new Set<string>()

  function visit(key: string) {
    if (visited.has(key)) return
    visited.add(key)
    const chunk = manifest?.[key]
    if (!chunk) return
    // The client entry is already loaded via the page's own <script> tag — preloading it again
    // is redundant. Its manifest record has no `imports` (only `dynamicImports`, which this never
    // follows — that field lists EVERY block's chunk, and following it would undo the split by
    // preloading blocks the page doesn't use), so recursion stops there on its own regardless.
    if (!chunk.isEntry) files.add(chunk.file)
    for (const importee of chunk.imports ?? []) visit(importee)
  }

  for (const id of blockIds) visit(`src/blocks/${id}/variants.ts`)

  return [...files].map((file) => `/${file}`)
}
