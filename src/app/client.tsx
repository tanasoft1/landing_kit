import { StartClient } from '@tanstack/react-start/client'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { blockModules } from '@/blocks/block-modules'
import type { BlockId } from '@/blocks/registry'
import { pages } from '@/config/pages.config'
import { site } from '@/config/site.config'
import { normalizePath, resolveRequest } from '@/lib/pages/resolve-request'

// Replaces the client entry `@tanstack/react-start` would generate. Vite picks this file up by
// name; `vite.config.ts` also names it explicitly. The body is the default entry's, with one
// addition: the `await` below.

/**
 * Which block modules does THIS url need? `pages.config.ts` already knows, so no guessing.
 * A path that resolves to nothing (a 404) needs none.
 */
function blocksForCurrentUrl(): BlockId[] {
  // `/docs` is not in pages.config.ts (see src/routes/docs.tsx), so `resolveRequest` treats it
  // like a 404 — but it previews every variant of every block, so it needs them all. Handled
  // here rather than teaching `resolveRequest` about a route that is not a page.
  if (normalizePath(window.location.pathname) === '/docs') {
    return Object.keys(blockModules) as BlockId[]
  }
  const resolved = resolveRequest(window.location.pathname, pages, site)
  if (!resolved) return []
  return resolved.page.blocks.map((b) => (typeof b === 'string' ? b : b.id))
}

async function hydrate() {
  // Load the chunks BEFORE hydrating, and never with React.lazy: lazy suspends during
  // hydration, which makes React throw away the server-rendered HTML — measured CLS 0.000 to
  // 0.169.
  //
  // This runs once, for the first URL only. Nothing re-runs it when you navigate. That is safe
  // only because every link here is a plain `<a href>` full page load, never a
  // `@tanstack/react-router` `<Link>`, which would move to a page whose blocks were never
  // fetched. `check-conventions.mjs` fails the build on any `Link` import from
  // `@tanstack/react-router` inside `src/blocks`, `src/components` or `src/routes`.
  const ids = blocksForCurrentUrl()
  const results = await Promise.allSettled(ids.map((id) => blockModules[id]?.()))

  // `allSettled`, not `all`, so the error names every block that failed instead of only the
  // first. This really happens when cached HTML points at hashed assets a deploy has purged.
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
    // Deliberately does not hydrate. A missing block module makes `getVariants` throw during
    // hydration, and React's retry leaves a blank page. A readable static page beats that.
    // Nothing on this path may suspend — see the React.lazy note above.
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

// The `.catch` is the point. A bare `void hydrate()` throws the rejection away, so a failed
// chunk leaves a dead page with nothing in the console.
void hydrate().catch((err) => {
  console.error(
    '[landing-kit] Hydration failed before it could start. The page is not interactive.',
    err,
  )
})
