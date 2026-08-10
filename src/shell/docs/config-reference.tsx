import { pages } from '~/config/pages.config'
import { site } from '~/config/site.config'
import { enumerateUrls } from '~/shell/pages/enumerate'

// Prose describing how to do these tasks lives in exactly one place: the README. Restating it
// here would be a second copy that drifts the moment the first one changes — this section is
// pointers to headings, not a rewrite of them.
const RECIPES = [
  { label: 'Add a block', href: '/README.md#adding-a-block' },
  {
    label: 'Add a variant to an existing block',
    href: '/README.md#adding-a-variant-to-an-existing-block',
  },
  { label: 'Reskin: the token surface', href: '/README.md#reskinning-the-token-surface' },
  { label: 'The Cyrillic font requirement', href: '/README.md#the-cyrillic-font-requirement' },
  { label: 'The three env flags', href: '/README.md#the-three-env-flags' },
  { label: 'Swap the whole config', href: '/README.md#swapping-the-whole-config-configs' },
  { label: 'The contact form', href: '/README.md#the-contact-form' },
  {
    label: 'Gotchas that cost real debugging time',
    href: '/README.md#gotchas-that-cost-real-debugging-time',
  },
  { label: 'Lighthouse budget', href: '/README.md#lighthouse-budget' },
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
          Common changes, documented once, in the README — not restated here.
        </p>
        <ul className="mt-3 grid gap-1">
          {RECIPES.map((r) => (
            <li key={r.href}>
              <a className="text-sm underline" href={r.href}>
                {r.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
