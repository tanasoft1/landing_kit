import { StartClient } from '@tanstack/react-start/client'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { blockModules } from '@/blocks/block-modules'
import type { BlockId } from '@/blocks/registry'
import { pages } from '@/config/pages.config'
import { site } from '@/config/site.config'
import { normalizePath, resolveRequest } from '@/lib/pages/resolve-request'

// Overrides `@tanstack/react-start`'s generated client entry — a supported override, resolved by
// filename convention (see `resolveEntry` in `@tanstack/start-plugin-core`). The installed
// version's default entry (`default-entry/client.tsx`) is a side-effect-only module: no exports,
// just `startTransition(() => hydrateRoot(document, <StrictMode><StartClient /></StrictMode>))`
// run on import. `StartClient` itself takes no props in this version — it resolves the router
// internally via `hydrateStart()`, which discovers `src/router.tsx`'s `getRouter` export by the
// same filename convention. So there is no second router to build and no `router` prop to pass;
// the only change from the default entry is the `await` inserted below.

/**
 * Which block modules does THIS url need? Knowable statically from pages.config.
 * An unresolvable path (404) needs none.
 */
function blocksForCurrentUrl(): BlockId[] {
  // `/docs` is deliberately absent from pages.config.ts (see src/routes/docs.tsx), so
  // `resolveRequest` returns null for it exactly as it would for a real 404 — but unlike a 404,
  // `/docs` renders every variant of every block and needs every block module registered before
  // hydration, not none. Special-cased here rather than by widening `resolveRequest`, which would
  // have to start knowing about a route that isn't a page.
  if (normalizePath(window.location.pathname) === '/docs') {
    return Object.keys(blockModules) as BlockId[]
  }
  const resolved = resolveRequest(window.location.pathname, pages, site)
  if (!resolved) return []
  return resolved.page.blocks.map((b) => (typeof b === 'string' ? b : b.id))
}

async function hydrate() {
  // Resolve the chunks BEFORE hydrating. React.lazy defers to render time, which makes the
  // component suspend during the hydration pass and forces React to discard the
  // server-rendered subtree — measured at CLS 0.169. Awaiting here means the modules are
  // already in memory when hydrateRoot runs, so no boundary suspends and nothing is discarded.
  //
  // This resolves ONLY the initial URL's blocks, once, here — nothing re-runs it on a later
  // client-side navigation. That is safe only because every navigation on this stack is a plain
  // `<a href>` (a full page load, cheap since every page is prerendered static HTML), never a
  // `@tanstack/react-router` `<Link>` (a client-side transition that would render a page whose
  // blocks were never fetched, throwing from `getVariants` with no build-time signal). This is a
  // deliberate design property of the kit, not an oversight — and it's enforced, not just
  // documented: `scripts/check-conventions.mjs` fails the build on a `Link` import from
  // `@tanstack/react-router` anywhere in `src/blocks`, `src/components` or `src/routes`. `src/routes`
  // matters most of the three — `__root.tsx` is where a global nav or skip-link would naturally
  // go, and it was the one directory the rule used to exempt.
  const ids = blocksForCurrentUrl()
  const results = await Promise.allSettled(ids.map((id) => blockModules[id]?.()))

  // `allSettled`, not `all`, so a failure names the block(s) that failed instead of surfacing
  // whichever one happened to reject first. Before the split there was one thing that could fail
  // to load; there are now up to four per page, and the realistic trigger is mundane — a visitor
  // on stale cached HTML after a deploy that purged the old hashed assets requests a chunk that
  // no longer exists.
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
    // Deliberately does NOT hydrate. Hydrating with a block module missing means `getVariants`
    // throws during the hydration render; React responds by discarding the server-rendered tree
    // and client-rendering the root, which throws again and leaves a blank page. Keeping the
    // prerendered HTML is strictly better than replacing readable content with nothing, and it
    // is the one recovery that cannot suspend — see the React.lazy account in
    // docs/superpowers/known-limitations.md for why anything that suspends here is off the table.
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

// The `.catch` is the point: `void hydrate()` on its own discarded the rejection, so a failed
// chunk left the page permanently inert with no error, no boundary and no signal of any kind.
// This branch covers anything the in-function handling above did not anticipate.
void hydrate().catch((err) => {
  console.error(
    '[landing-kit] Hydration failed before it could start. The page is not interactive.',
    err,
  )
})
