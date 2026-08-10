import { StartClient } from '@tanstack/react-start/client'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { blockModules } from '~/blocks/block-modules'
import type { BlockId } from '~/blocks/registry'
import { pages } from '~/config/pages.config'
import { site } from '~/config/site.config'
import { normalizePath, resolveRequest } from '~/shell/pages/resolve-request'

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
  // `@tanstack/react-router` anywhere in `src/blocks` or `src/shell`.
  await Promise.all(blocksForCurrentUrl().map((id) => blockModules[id]?.()))

  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    )
  })
}

void hydrate()
