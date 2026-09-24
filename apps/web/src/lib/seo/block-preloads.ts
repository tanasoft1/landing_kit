// Namespace import on purpose. A named import from node:fs breaks the client build.
import * as nodeFs from 'node:fs'
import type { BlockId } from '@/blocks/registry'
import { OUT_DIR } from './out-dir'

type ManifestChunk = {
  file: string
  isEntry?: boolean
  imports?: string[]
}

type ViteManifest = Record<string, ManifestChunk>

let manifestCache: ViteManifest | null | undefined

function loadManifest(): ViteManifest | null {
  if (manifestCache !== undefined) return manifestCache
  const manifestPath = `${OUT_DIR}/.vite/manifest.json`
  if (!nodeFs.existsSync(manifestPath)) {
    // Normal in dev.
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

// modulepreload hrefs for a page's block chunks. Guarded by import.meta.env.SSR, not a
// `.server.ts` name, because the client bundle imports this file too.
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
    // Skip the entry. Do not follow `dynamicImports`: it lists every block's chunk.
    if (!chunk.isEntry) files.add(chunk.file)
    for (const importee of chunk.imports ?? []) visit(importee)
  }

  for (const id of blockIds) visit(`src/blocks/${id}/variants.ts`)

  return [...files].map((file) => `/${file}`)
}
