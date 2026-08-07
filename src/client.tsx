import { StartClient } from '@tanstack/react-start/client'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { blockModules } from '~/blocks/block-modules'
import type { BlockId } from '~/blocks/registry'
import { pages } from '~/config/pages.config'
import { site } from '~/config/site.config'
import { resolveRequest } from '~/shell/pages/resolve-request'

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
  const resolved = resolveRequest(window.location.pathname, pages, site)
  if (!resolved) return []
  return resolved.page.blocks.map((b) => (typeof b === 'string' ? b : b.id))
}

async function hydrate() {
  // Resolve the chunks BEFORE hydrating. React.lazy defers to render time, which makes the
  // component suspend during the hydration pass and forces React to discard the
  // server-rendered subtree — measured at CLS 0.169. Awaiting here means the modules are
  // already in memory when hydrateRoot runs, so no boundary suspends and nothing is discarded.
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
