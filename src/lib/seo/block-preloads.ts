// Namespace import, not named: Vite's client-build stub for node builtins has no named exports,
// so a named import fails Rollup's static check before dead-branch elimination (below) can
// remove the usage. A namespace import defers the lookup to a runtime member access instead.
import * as nodeFs from 'node:fs'
import type { BlockId } from '@/blocks/registry'
import { OUT_DIR } from './out-dir'

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
  // Derived from shared `OUT_DIR`, not restated, so a changed output dir can't leave this
  // looking in the old place (a missing manifest looks identical to the `pnpm dev` case below).
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
 * Server-only. Root-relative hrefs for `<link rel="modulepreload">`, so a page's block chunks
 * (and what they statically import, e.g. the shared `motion` chunk) fetch in parallel with the
 * main chunk instead of being discovered only after it downloads and executes.
 *
 * Guarded by `import.meta.env.SSR`, not a `.server.ts` filename: this is reachable from
 * `build-head.ts`, shared route code the client also runs, so the stricter import-protection
 * guard would fail the client build. Vite replaces `import.meta.env.SSR` with `false` on the
 * client, so the branch (and `node:fs`) is dead code and gets stripped — confirmed empirically.
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
    // The client entry is already loaded via the page's <script> tag, so preloading it again is
    // redundant. Never follows `dynamicImports` either — that lists EVERY block's chunk, and
    // following it would preload blocks the page doesn't use.
    if (!chunk.isEntry) files.add(chunk.file)
    for (const importee of chunk.imports ?? []) visit(importee)
  }

  for (const id of blockIds) visit(`src/blocks/${id}/variants.ts`)

  return [...files].map((file) => `/${file}`)
}
