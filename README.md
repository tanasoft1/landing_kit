# Landing Kit

A bilingual (Mongolian + English) landing page, prerendered to static HTML.

You build a site by **editing config and copy files — not by rewriting components**. Everything
below is written to keep that true.

## Contents

- [Quick start](#quick-start)
- [What you edit](#what-you-edit)
- [Adding a page](#adding-a-page)
- [Adding a block](#adding-a-block)
- [Adding a variant](#adding-a-variant)
- [Changing the design](#changing-the-design)
- [The contact form](#the-contact-form)
- [Fonts and Mongolian Cyrillic](#fonts-and-mongolian-cyrillic)
- [`/docs`: the live reference](#docs-the-live-reference)
- [Removing the /docs page](#removing-the-docs-page)
- [Rules the build enforces](#rules-the-build-enforces)
- [Gotchas](#gotchas)
- [Scripts](#scripts)
- [Scaffolding a new site](#scaffolding-a-new-site)
- [The three env flags](#the-three-env-flags)
- [Swapping the whole config: `configs/`](#swapping-the-whole-config-configs)
- [Lighthouse budget](#lighthouse-budget)
- [Publishing](#publishing)

## Quick start

```bash
pnpm install
pnpm dev
```

Mongolian is at `/`, English at `/en`.

Before you deploy, set `url` in `src/config/site.config.ts` to your real domain. `pnpm verify`
fails until you do.

## What you edit

Two words explain the whole model:

- A **block** is one section of a page — hero, features, cta, contact.
- A **page** is just an ordered list of blocks.

So most work happens in four files:

| You want to | Edit |
|---|---|
| Change the words on the page | `src/blocks/<block>/copy.mn.ts` and `copy.en.ts` |
| Add, remove or reorder sections | `src/config/pages.config.ts` |
| Change the site name, menu or contact details | `src/config/site.config.ts` |
| Change colours, fonts or spacing | `src/styles/presets/*.css` |

The rest of `src/` you rarely open:

| Path | Holds |
|---|---|
| `src/blocks/` | One folder per block: its copy, its manifest, its components |
| `src/components/` | Shared UI — layout, header, footer, theme toggle |
| `src/lib/` | Shared logic — SEO, page resolution, types. No JSX, ever |
| `src/routes/` | Four route files. You will not need a fifth — see [Adding a page](#adding-a-page) |
| `src/styles/` | `theme.css` (the system) and `presets/` (the skin) |
| `src/app/` | Framework entry points. Leave these alone |
| `src/integrations/` | Motion, theme and submit implementations, chosen at build time |

## Adding a page

```bash
landing-kit add-page about --blocks=features,cta \
  --title-mn="Бидний тухай" --title-en="About us"
```

A page is **one entry in `src/config/pages.config.ts`**. You never add a file to `src/routes/` —
`$.tsx` is a catch-all that resolves any path against the page list.

By hand, the same thing:

```ts
{
  id: 'about',
  path: '/about',
  blocks: ['features', 'cta'],
  seo: {
    mn: { title: 'Бидний тухай', description: 'Компанийн танилцуулга.' },
    en: { title: 'About us', description: 'About our company.' },
  },
},
```

That one entry produces both locales' URLs, the sitemap entries and the prerendered files.

Both titles are required and they must differ — the build rejects two locales sharing a `<title>`
as duplicate content.

To put the page in the menu, add `{ target: 'about' }` to `nav` in `site.config.ts`. The label is
that page's `seo.title` for the language being rendered.

> `nav` targets and link `target`s take a page id or a block id. A block id becomes an anchor on
> whichever page holds it. A target matching neither fails the build, so you never ship a dead link.

## Adding a block

```bash
landing-kit add-block testimonials                       # one variant, named `simple`
landing-kit add-block pricing --variants=simple,detailed # two
```

That writes the folder, makes all three registrations, and formats the result — so `pnpm verify`
passes with nothing else to run. Then:

1. Write the copy in `src/blocks/testimonials/copy.mn.ts` and `copy.en.ts`.
2. Add `'testimonials'` to a page's `blocks` in `pages.config.ts`.
3. Run `pnpm verify`.

By hand, a block is four files in its own folder plus three registrations:

| File | Holds |
|---|---|
| `copy.mn.ts` | The Mongolian copy, and the `Copy` type both locales share |
| `copy.en.ts` | The English copy, typed against that same type |
| `manifest.ts` | Variant **names**, default variant, copy. **No component imports** |
| `variants.ts` | The name → component map |

and then add it to `registry.ts`, `block-modules.ts` and `variants.all.ts`.

Get the registrations wrong and TypeScript tells you by name — all three are typed
`Record<BlockId, …>`, and `BlockId` comes from the registry. **One mistake is not caught:** a
component imported into `manifest.ts`. The manifest is loaded eagerly for SEO, so a component
reached from it lands in the main bundle. Measured cost: 334 KB → 459 KB, with every check still
green. Keep `manifest.ts` free of components.

## Adding a variant

A variant is a different layout for the same block and copy. Three steps, all inside the block's
folder:

1. Add the component, e.g. `src/blocks/hero/hero-poster.tsx`.
2. Add its name to `variantNames` in `manifest.ts` — `['centered', 'split', 'poster'] as const`.
3. Map the name to the component in `variants.ts` — `poster: HeroPoster`.

Then use it: `{ id: 'hero', variant: 'poster' }` in `pages.config.ts`.

You cannot forget step 3 — a name with no component is a compile error, and so is a component the
names never declare.

## Changing the design

All colour, type and spacing lives in CSS variables, in two layers:

- **`src/styles/theme.css`** — the system: type scale, spacing rhythm, and the mapping from
  variables to Tailwind utilities. Don't edit this to reskin.
- **`src/styles/presets/*.css`** — the skin: fonts, radius, shadows, and the light/dark palette.
  This is what you replace.

Swapping the whole look is one line:

```css
/* src/styles/theme.css */
@import './presets/warm.css'; /* was './presets/editorial.css' */
```

Two presets ship. `editorial.css` is quiet and neutral with a small radius and no card shadow.
`warm.css` is amber and denser, with rounder corners and a real shadow. They differ in colour,
radius, shadow and density on purpose, so a swap reads as a different design.

To add a third, copy a preset file and declare **the same variables**. That is checked, not
advisory: `pnpm conventions` fails if a preset misses a variable the theme maps. Without the check
the failure is invisible — a missing `--c-ring` just means no focus outline, and the build stays
green.

The fastest way to see a preset is [`/docs`](#docs-the-live-reference), which renders every token
live.

## The contact form

`src/blocks/contact/contact-form.tsx`, built on `react-hook-form` and `zod`. The schema lives in
`src/integrations/submit-schema.ts`.

It has two spam defences you should know about before you test it:

- A **honeypot** field that must stay empty.
- A **2 second minimum** on screen. Submit faster and it waits, it does not reject you.

## Fonts and Mongolian Cyrillic

Both fonts **must** cover Cyrillic Extended. Mongolian uses `ө` and `ү`, which sit outside the
basic Cyrillic block.

If you swap a preset's fonts, check the replacement ships both a `cyrillic` **and** a
`cyrillic-ext` subset. A font with only `cyrillic` renders those two letters in a mismatched
fallback font — easy to miss if you only proofread the English.

This also means Mongolian pages load a little more font data than English ones. That is real and
unavoidable, not a bug.

## `/docs`: the live reference

`/docs` is a generated, English-only page showing every design token, every block and variant, and
the resolved config. It reads the real code, so it cannot go out of date.

Visitors never see it: it is not prerendered, not in the sitemap, and carries `noindex`.

## Removing the /docs page

It costs visitors nothing, but delete it whenever you like:

```bash
rm src/routes/docs.tsx
rm -rf src/components/docs
```

Nothing else. `pnpm verify` passes with the route gone.

## Rules the build enforces

These are checked automatically, so you will hear about them early. Each exists because breaking
it fails silently.

- **Spacing and width come from `<Section>` and `<Container>`.** Don't write raw padding, width,
  `min-h-screen`, a bare `<section>`, or an inline `style` in a block.
- **Never write a literal `<h1>` or `<h2>` in a block.** A block cannot know if it opens the page.
  Use `const H = headingLevel === 1 ? 'h1' : 'h2'` and render `<H>`.
- **Never import `Link` from `@tanstack/react-router`.** Every link is a plain `<a href>`. Blocks
  are loaded once for the first URL, so a client-side jump would land on a page whose blocks were
  never fetched. Full page loads are cheap here — every page is static HTML.
- **Both locales, always.** There is no fallback language. Declare the copy type in `copy.mn.ts`
  and import it into `copy.en.ts`, so a missing translation is a compile error.
- **No components in `manifest.ts`.** See [Adding a block](#adding-a-block).

## Gotchas

- **The contact form's 2 second guard also applies to you** while testing by hand. Working as
  intended.
- **`<input type="email">` blocks submission before any handler runs**, so a malformed email never
  reaches the schema. Don't hunt for a schema bug that isn't there.
- **If the contact form "silently fails", check CORS first.** In endpoint mode the browser POSTs
  cross-origin, so an endpoint without `Access-Control-Allow-Origin` fails at preflight — and it
  surfaces as the same generic error a real code bug would.
- **React warns `Invalid DOM property 'hreflang'` in dev.** Expected. The lowercase spelling is
  what SEO tools read from the built HTML. Renaming it to `hrefLang` would ship the wrong casing.
- **A light-only or dark-only build ships no theme-switching code at all** — none of the
  JavaScript, not just a hidden toggle.
- **A page flashing to "Not Found" right after it loads** usually means the host serves
  prerendered files by their literal `index.html` filename. `normalizePath` in
  `src/lib/pages/resolve-request.ts` handles this; check there first.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build, including prerendering |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | `biome ci .` |
| `pnpm fix` | Auto-fixes what `lint` reports |
| `pnpm conventions` | The rules above, plus preset and docs checks |
| `pnpm verify` | Everything, in order. **Run this before you deploy.** |

`pnpm verify` ends with `verify-build.mjs`, which reads the pages the build actually produced and
checks each one: exactly one `<h1>`, no hidden content in the HTML, a complete `hreflang` set,
valid JSON-LD, and a sitemap that agrees with the `<head>`.

## Scaffolding a new site

You do not copy this repository by hand. The CLI writes a fresh project:

```bash
pnpm dlx @dewsoft/landing-kit@latest frontend --yes
```

It asks four questions — pages, theme, preset, blocks — and every answer has a flag, so
`--yes` takes the defaults. Run `landing-kit --help` for the full list.

Blocks are not freely combinable: some blocks' copy links to others, and a link to a block you
left out would render a blank page. The CLI refuses those combinations at the question rather than
letting the build fail later.

The generated project has no dependency on this kit. It is a plain TanStack Start app.

## The three env flags

Set at build or dev time. Each swaps an import alias in `vite.config.ts` — never an `if` inside a
component.

| Flag | Values | Effect |
|---|---|---|
| `KIT_ANIMATION` | `on` (default), `off` | `off` swaps `@/motion` to passthrough components, and the `motion` library leaves the bundle entirely. |
| `KIT_SUBMIT` | `endpoint` (default), `server` | `endpoint` POSTs to `VITE_CONTACT_ENDPOINT`. `server` uses a TanStack Start server function. Both validate with the same schema. |
| `KIT_CONFIG` | `default` (default), `onepage` | Selects which config directory the app and the build driver both read. |

`site.theme.mode` in `site.config.ts` works the same way: `'both'` ships the toggle and the
no-flash script, anything else ships no theme-switching code at all.

## Swapping the whole config: `configs/`

`configs/smoke-onepage/` is a complete second config — one page holding every block, light only.
It exists to prove the premise end to end: it contains **no components and no overrides**, and
needs zero edits under `src/`.

```bash
node tools/kit.mjs smoke:onepage
```

produces a working single-page, light-only, unanimated site — where the hero's CTA resolves to
`#contact` (an anchor) instead of `/contact` (a page), from the same components and the same copy.

If you add another config, remember that **`vite.config.ts` must branch on `KIT_CONFIG` too**. The
alias only affects app code Vite bundles; the config file reads its own `pages`/`site` directly to
drive prerendering.

## Lighthouse budget

`lighthouserc.json` (mobile) and `lighthouserc.desktop.json` (desktop) assert on all four
prerendered pages of the default build.

```bash
node tools/kit.mjs lighthouse
node tools/kit.mjs lighthouse:desktop
```

Both are maintainer commands and neither ships to a generated project.

## Publishing

This package is published to npm as `@dewsoft/landing-kit`.

```bash
npm version patch     # or minor / major
npm publish
```

`files` in `package.json` is an allowlist — anything not named there never reaches the tarball,
which is how `tools/`, `configs/` and the Lighthouse configs stay out of published installs.

### Maintainer commands

`tools/kit.mjs` holds the commands that only make sense in this repository:

```bash
node tools/kit.mjs smoke:full         # default config, animated, server submit
node tools/kit.mjs smoke:onepage      # one-page config, no animation, endpoint submit
node tools/kit.mjs lighthouse         # mobile budget
node tools/kit.mjs lighthouse:desktop # desktop budget
```
