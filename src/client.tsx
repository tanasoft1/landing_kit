import { StartClient } from '@tanstack/react-start/client'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { blockModules } from '@/blocks/block-modules'
import type { BlockId } from '@/blocks/registry'
import { pages } from '@/config/pages.config'
import { site } from '@/config/site.config'
import { normalizePath, resolveRequest } from '@/lib/pages/resolve-request'

// Overrides `@tanstack/react-start`'s generated client entry (filename-convention override, see
// `resolveEntry` in `@tanstack/start-plugin-core`). Same body as the default entry; the only
// change is the `await` inserted below.

/**
 * Which block modules does THIS url need? Knowable statically from pages.config.
 * An unresolvable path (404) needs none.
 */
function blocksForCurrentUrl(): BlockId[] {
  // `/docs` is absent from pages.config.ts (see src/routes/docs.tsx), so `resolveRequest` treats
  // it like a 404 — but it renders every variant of every block and needs them all registered.
  // Special-cased here rather than teaching `resolveRequest` about a route that isn't a page.
  if (normalizePath(window.location.pathname) === '/docs') {
    return Object.keys(blockModules) as BlockId[]
  }
  const resolved = resolveRequest(window.location.pathname, pages, site)
  if (!resolved) return []
  return resolved.page.blocks.map((b) => (typeof b === 'string' ? b : b.id))
}

async function hydrate() {
  // Resolve chunks BEFORE hydrating, not via React.lazy: lazy suspends during hydration and
  // forces React to discard the server-rendered subtree — measured CLS 0.000 -> 0.169.
  //
  // This resolves only the initial URL's blocks, once — nothing re-runs it on a later navigation.
  // Safe only because every navigation here is a plain `<a href>` full page load, never a
  // `@tanstack/react-router` `<Link>` (a client-side transition to a page whose blocks were never
  // fetched). `check-conventions.mjs` enforces this: it fails the build on a `Link` import from
  // `@tanstack/react-router` anywhere in `src/blocks`, `src/components` or `src/routes`.
  const ids = blocksForCurrentUrl()
  const results = await Promise.allSettled(ids.map((id) => blockModules[id]?.()))

  // `allSettled`, not `all`, so a failure names every block that failed, not just whichever
  // rejected first. Realistic trigger: stale cached HTML after a deploy purges old hashed assets.
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
    // Deliberately does NOT hydrate: a missing block module makes `getVariants` throw during
    // hydration, and React's retry leaves a blank page. Keeping the prerendered HTML readable
    // beats that — see docs/superpowers/known-limitations.md for why nothing here may suspend.
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

// The `.catch` is the point: `void hydrate()` alone discarded the rejection, leaving a failed
// chunk's page inert with no error and no signal at all.
void hydrate().catch((err) => {
  console.error(
    '[landing-kit] Hydration failed before it could start. The page is not interactive.',
    err,
  )
})
