import { pages } from '@/config/pages.config'
import { site } from '@/config/site.config'
import { enumerateUrls } from '@/lib/pages/enumerate'

// Prose lives in the README, not here — this just names the headings, so nothing drifts.
//
// Plain text, not links: README.md ships in neither `public/` nor `dist/client/`, so
// `<a href="/README.md#…">` 404s in every real deployment. Copying it into `public/` was
// considered and rejected — that's a second copy, the thing this list exists to avoid.
const RECIPES = [
  'Adding a block',
  'Adding a variant to an existing block',
  'Reskinning: the token surface',
  'The Cyrillic font requirement',
  'The three env flags',
  'Swapping the whole config: `configs/`',
  'The contact form',
  'Gotchas that cost real debugging time',
  'Lighthouse budget',
] as const

export function ConfigReference() {
  const urls = enumerateUrls(pages, site)
  return (
    // `min-w-0` on every row: without it, a grid track sizes to its widest item's min-content —
    // the long unbroken JSON in `<pre>` below would stretch the column past the viewport, and
    // `overflow-x-auto` on the `<pre>` never gets a chance to engage.
    <div className="grid gap-8">
      <div className="min-w-0">
        <h3 className="text-h3 font-semibold">Pages this config produces</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Every prerendered URL, derived from pages.config.ts × site.locales.
        </p>
        <ul className="mt-3 grid gap-1">
          {urls.map((u) => (
            <li key={u.path}>
              <code className="text-sm">{u.path}</code>
              <span className="text-muted-foreground text-sm">
                {' '}
                — {u.pageId} / {u.locale}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0">
        <h3 className="text-h3 font-semibold">pages.config.ts</h3>
        <pre className="bg-muted rounded-base mt-3 overflow-x-auto p-4 text-xs">
          {JSON.stringify(pages, null, 2)}
        </pre>
      </div>

      <div className="min-w-0">
        <h3 className="text-h3 font-semibold">site.config.ts</h3>
        <pre className="bg-muted rounded-base mt-3 overflow-x-auto p-4 text-xs">
          {JSON.stringify(site, null, 2)}
        </pre>
      </div>

      <div className="min-w-0">
        <h3 className="text-h3 font-semibold">Recipes</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Common changes, documented once, in the repository’s README — not restated here, and not
          linked (README.md is not part of the deployed site).
        </p>
        <ul className="mt-3 grid gap-1">
          {RECIPES.map((r) => (
            <li key={r}>
              <code className="text-sm">README.md § {r}</code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
