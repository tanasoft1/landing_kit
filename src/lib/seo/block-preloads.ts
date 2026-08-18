// A namespace import, not a named one. In the client build Vite stubs node builtins with a
// module that has no named exports, so a named import fails Rollup's check before the dead
// branch below can be removed. A namespace import turns it into a runtime property lookup.
import * as nodeFs from 'node:fs'
import type { BlockId } from '@/blocks/registry'
import { OUT_DIR } from './out-dir'

type ManifestChunk = {
  file: string
  isEntry?: boolean
  imports?: string[]
}

type ViteManifest = Record<string, ManifestChunk>

// Cached for the life of the process. Prerendering builds every page in one Node process, and
// the manifest cannot change once the client build has finished.
let manifestCache: ViteManifest | null | undefined

function loadManifest(): ViteManifest | null {
  if (manifestCache !== undefined) return manifestCache
  // Built from the shared `OUT_DIR` instead of being written out again, so changing the output
  // dir cannot leave this looking in the old place. A missing manifest looks exactly like the
  // normal `pnpm dev` case below, so that mistake would be silent.
  const manifestPath = `${OUT_DIR}/.vite/manifest.json`
  if (!nodeFs.existsSync(manifestPath)) {
    // `pnpm dev` has no client build on disk — a missing manifest is normal there, not an error.
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
 * Server-only. Returns root-relative hrefs for `<link rel="modulepreload">`, so a page's block
 * chunks — and whatever they import, such as the shared `motion` chunk — download in parallel
 * with the main chunk instead of being found only after it runs.
 *
 * Guarded by `import.meta.env.SSR` rather than a `.server.ts` filename. `build-head.ts` imports
 * this, and that file is shared route code the client bundles too, so the stricter filename
 * guard would fail the client build. On the client Vite replaces `import.meta.env.SSR` with
 * `false`, so this branch and `node:fs` are dropped as dead code (checked in the output).
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
    // The page's <script> tag already loads the client entry, so preloading it again does
    // nothing. Do not follow `dynamicImports` either: it lists EVERY block's chunk, so
    // following it would preload blocks this page does not use.
    if (!chunk.isEntry) files.add(chunk.file)
    for (const importee of chunk.imports ?? []) visit(importee)
  }

  for (const id of blockIds) visit(`src/blocks/${id}/variants.ts`)

  return [...files].map((file) => `/${file}`)
}
