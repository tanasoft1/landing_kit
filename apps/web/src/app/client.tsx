import { StartClient } from '@tanstack/react-start/client'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { blockModules } from '@/blocks/block-modules'
import type { BlockId } from '@/blocks/registry'
import { pages } from '@/config/pages.config'
import { site } from '@/config/site.config'
import { normalizePath, resolveRequest } from '@/lib/pages/resolve-request'

// Custom client entry: the default one, plus loading block chunks before hydration.

function blocksForCurrentUrl(): BlockId[] {
  // /docs is not a page in pages.config.ts, but it previews every block.
  if (normalizePath(window.location.pathname) === '/docs') {
    return Object.keys(blockModules) as BlockId[]
  }
  const resolved = resolveRequest(window.location.pathname, pages, site)
  if (!resolved) return []
  return resolved.page.blocks.map((b) => (typeof b === 'string' ? b : b.id))
}

async function hydrate() {
  // Load chunks before hydrating. Never use React.lazy: it suspends during hydration and React
  // throws away the server HTML. This runs for the first URL only, which is safe because site
  // links are plain <a href>, never router <Link> (check-conventions enforces this).
  const ids = blocksForCurrentUrl()
  const results = await Promise.allSettled(ids.map((id) => blockModules[id]?.()))

  // allSettled, so the error names every failed block.
  const failed = ids.filter((_, i) => results[i]?.status === 'rejected')
  if (failed.length > 0) {
    const reasons = results
      .map((r, i) => (r.status === 'rejected' ? `${ids[i]}: ${r.reason}` : null))
      .filter(Boolean)
    console.error(
      `[landing-kit] Hydration skipped: ${failed.length} block chunk(s) failed to load ` +
        `(${failed.join(', ')}). The prerendered HTML is still on screen and readable — links ` +
        `are plain <a href> and every page is static — but nothing on it is interactive: the ` +
        `contact form and the theme toggle will not respond. The usual cause is stale cached ` +
        `HTML pointing at hashed assets a later deploy purged; a hard reload fetches HTML that ` +
        `references chunks which exist.\n${reasons.join('\n')}`,
    )
    // Skip hydration: with a block missing, React would leave a blank page. Static HTML is better.
    return
  }

  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    )
  })
}

// Keep the .catch, or a failure leaves a dead page with nothing in the console.
void hydrate().catch((err) => {
  console.error(
    '[landing-kit] Hydration failed before it could start. The page is not interactive.',
    err,
  )
})
