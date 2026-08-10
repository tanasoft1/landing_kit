import { pages } from '~/config/pages.config'
import { site } from '~/config/site.config'
import { enumerateUrls } from '~/shell/pages/enumerate'

// Prose describing how to do these tasks lives in exactly one place: the README. Restating it
// here would be a second copy that drifts the moment the first one changes — this section names
// the headings to read, and nothing more.
//
// Plain text, NOT links. `README.md` ships in neither `public/` nor `dist/client/`, so an
// `<a href="/README.md#…">` 404s in every real deployment; on the dev server it "works" only by
// serving raw text/markdown, where the `#anchor` fragment is inert anyway. A dead link in
// developer docs is worse than a plain instruction — the reader who clicks it learns the docs
// are unreliable. Copying the README into `public/` was considered and rejected: that is a
// second copy of the file, which is the thing this list exists to avoid.
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
    // `min-w-0` on every row: a single-column grid's one track sizes to the widest item's
    // intrinsic (min-content) width unless told otherwise — the same "auto minimum size" trap
    // flex items have. The `<pre>` blocks below are long, unbroken JSON lines; without this,
    // their min-content width stretches the shared column past the viewport at narrow widths,
    // and `overflow-x-auto` on the `<pre>` never gets a chance to engage because the column
    // itself already grew to fit. `min-w-0` lets the track size to the container instead, so
    // the `<pre>` scrolls internally the way its class says it should.
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
