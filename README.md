# Landing Kit

A bilingual (Mongolian / English) landing-page boilerplate built on TanStack Start. The premise:
a scaffolding CLI (or a person copying this repo) should be able to produce a different site by
**swapping config files and env flags — never by editing components**. Everything in this README
exists to keep that true.

## Contents

- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Architecture in one page](#architecture-in-one-page)
- [Adding a block](#adding-a-block)
- [Adding a variant to an existing block](#adding-a-variant-to-an-existing-block)
- [Reskinning: the token surface](#reskinning-the-token-surface)
- [`/docs`: the living developer reference](#docs-the-living-developer-reference)
- [The Cyrillic font requirement](#the-cyrillic-font-requirement)
- [The three env flags](#the-three-env-flags)
- [Swapping the whole config: `configs/`](#swapping-the-whole-config-configs)
- [The contact form](#the-contact-form)
- [Gotchas that cost real debugging time](#gotchas-that-cost-real-debugging-time)
- [Lighthouse budget](#lighthouse-budget)
- [Known limitations](docs/superpowers/known-limitations.md) — open issues, latent gaps in the
  verification scripts, and what's deliberately deferred. Read this before changing the block
  registry, either script, or anything performance-related.

## Quick start

```bash
pnpm install
pnpm dev
```

## Scripts

| Script | What it does | What it verifies |
|---|---|---|
| `pnpm dev` | Starts the dev server (`vite dev`). | — |
| `pnpm build` | Production build with prerendering (`vite build`). | — |
| `pnpm typecheck` | `tsc --noEmit`. | The whole `src/` tree, `scripts/`, and `vite.config.ts` type-check, including `configs/` (added to `tsconfig.json`'s `include`). |
| `pnpm lint` | `biome ci .` | Zero warnings (one known info about a deprecated `biome.json` field). |
| `pnpm fix` | `biome check --write .` | Auto-fixes what `lint` would flag. |
| `pnpm conventions` | `node scripts/check-conventions.mjs` | **Layout** (`src/blocks`, `src/routes`, `src/shell`): use `<Section>`/`<Container>`, never raw spacing/width utilities, `min-h-screen`, a raw `<section>`, an arbitrary-value `[...]` escape, or an inline `style`. Only `src/shell/layout/section.tsx` and `container.tsx` are exempt — they define the primitives. **Headings** (`src/blocks` only): no literal `<h1>`/`<h2>`; heading level is renderer-assigned (see below). A route owns its own outline, so it is not subject to this one. **`<Link>`** (everywhere): no `Link` import from `@tanstack/react-router` — see [Gotchas](#gotchas-that-cost-real-debugging-time). Plus: `/docs` keeps its `noindex` meta, and `/docs`'s recipe list names real README headings. Rules are matched against parsed `className` contents and JSX element names, never raw source text, so prose describing a utility cannot be a violation and cannot hide one. |
| `pnpm verify` | `lint && typecheck && conventions && build && verify-build` | The full default-config gate. This is what CI should run. |
| `pnpm smoke:full` | Builds the **default** config with every boundary at its "on" setting (`KIT_CONFIG=default KIT_ANIMATION=on KIT_SUBMIT=server`) and runs `verify-build.mjs`. | 4 pages (`/`, `/en`, `/contact`, `/en/contact`) prerender correctly. |
| `pnpm smoke:onepage` | Builds the **one-page smoke** config with every boundary at its "off"/alternate setting (`KIT_CONFIG=onepage KIT_ANIMATION=off KIT_SUBMIT=endpoint`) and runs `verify-build.mjs`. | 2 pages (`/`, `/en`) prerender correctly, with zero component changes from the default build — this is the proof that config-swapping actually works. |
| `pnpm lighthouse` | **Rebuilds the default config**, then `lhci autorun` against `dist/client` using `lighthouserc.json`, 5 runs per URL for a stable median. The rebuild is not optional: `lhci` measures whatever is already in `dist/client`, and the smoke scripts leave a *different* config's output there — run in gate order, this used to measure the one-page, light-only, unanimated build while asserting the default config's budget. | Mobile (throttled CPU + network), the harder and more representative preset; `categories:performance` is a hard `error` at `minScore: 0.85`. |
| `pnpm lighthouse:desktop` | Same, rebuild included, but `lighthouserc.desktop.json` — a separate config, not a flag on the same one. | Desktop preset; `categories:performance` is a hard `error` at `minScore: 0.95`, since both locales measure 1.00 here (see [Lighthouse budget](#lighthouse-budget)). |

`node scripts/verify-build.mjs` (run by both `verify` and the two smoke scripts) reads
`.kit/urls.json` — a manifest of exactly which pages *this* build produced — so it always checks
whichever config just built, not a hardcoded page list. It asserts: exactly one `<h1>` per page,
no hidden content (`opacity:0`, `visibility:hidden`, `display:none`) in the prerendered HTML, a
complete `hreflang` set per page, JSON-LD `@id` reference integrity, and that the `<head>` and
`sitemap.xml` agree on every page's alternates.

## Architecture in one page

- **Blocks** live in `src/blocks/<id>/` and are registered once in `src/blocks/registry.ts`.
  A block is deliberately split across two modules:
  - `manifest.ts` — metadata only: `variantNames` (a `readonly` array of **names**, not
    components), `defaultVariant`, `copy` per locale, optional `nav` and `schema`. It imports
    **no components**.
  - `variants.ts` — the name→component map, constrained by
    `satisfies Record<XVariant, ComponentType<BlockProps<XCopy>>>`. Variant components have the
    signature `(props: BlockProps<Copy>) => ReactNode`.

  The split is what makes per-block code-splitting possible, and it is load-bearing rather than
  stylistic. `registry.ts` imports every manifest **eagerly**, because the `<head>`, the JSON-LD
  graph and the nav all need `copy`/`nav`/`schema` synchronously — so a component reachable from a
  `manifest.ts` joins that eager chain and lands in the main chunk. It pulls **that block's own
  components, plus anything they share**, not every block's: a `hero` manifest reaching
  `HeroCentered` moves hero's components *and* the 123 KB `motion` chunk they import, while
  `contact` keeps its own chunk. That is worse than it sounds, because it is silent — no build
  error, and the machine gate stays green (see [Adding a block](#adding-a-block)). Components are
  reached only through
  `src/blocks/block-modules.ts` (dynamic `import()`, client) and `src/blocks/variants.all.ts`
  (static, server). See
  [Known limitations](docs/superpowers/known-limitations.md#resolved-pre-hydration-block-imports)
  for the measurements and for the `React.lazy` approach that was tried and reverted.
- **Pages** are declared *only* in `pages.config.ts` (`configs/<name>/pages.config.ts` or
  `src/config/pages.config.ts`) as an ordered list of block references. There is no manual
  routing — `src/routes/$.tsx` is a catch-all that resolves any path against the page list.
- **`BlockProps`** is `{ copy, site, resolve, surface, anchorId, headingLevel }`. Only `copy` is
  block-specific; everything else is assigned by the renderer:
  - `resolve(target)` turns a page id or block id into the right `href` — a page id becomes a
    real path, a block id present on the *current* page becomes an in-page anchor (`#id`), and a
    block id on *another* page becomes `path#id`. The same component, same copy, produces a page
    link or an anchor link purely based on where the target block actually lives in the current
    config — this is the mechanism the one-page smoke config exercises.
  - `headingLevel` is `1` for the page's first block and `2` for every other block. A block never
    decides this itself (it doesn't know if it opens the page); it renders
    `const H = headingLevel === 1 ? 'h1' : 'h2'` and uses `<H>`. `check-conventions.mjs` forbids
    a literal `<h1>`/`<h2>` anywhere in `src/blocks`, no exceptions.
  - `surface` alternates `default`/`muted` automatically across blocks on a page (or is set
    per-block-reference in `pages.config.ts`), and the block hands it straight to its own
    `<Section surface={surface}>`.
- **Three swappable boundaries**, each an import alias resolved in `vite.config.ts` based on an
  env flag, never on an `if` inside a component: `~/motion`, `~/theme`, `~/submit`. See
  [The three env flags](#the-three-env-flags).

## Adding a block

Eight steps: five inside the block's own folder (two copy files, the manifest, the variants map,
and the component `.tsx` files themselves), three registration points outside it, plus the page
reference. Copying `src/blocks/cta/` is the shortest route — it is the smallest complete block.

1. **Copy a block folder**, e.g. `src/blocks/cta/` → `src/blocks/testimonials/`, and rename the
   component files (`cta-banner.tsx` → `testimonials-grid.tsx`, …).
2. **`copy.mn.ts`** — declare the copy type explicitly and export `mn`:
   ```ts
   export type TestimonialsCopy = { heading: string; items: { quote: string }[] }
   export const mn: TestimonialsCopy = { heading: 'Сэтгэгдэл', items: [/* … */] }
   ```
   **`copy.en.ts`** imports that type and exports `en` against it:
   ```ts
   import type { TestimonialsCopy } from './copy.mn'
   export const en: TestimonialsCopy = { heading: 'Testimonials', items: [/* … */] }
   ```
   Both locales, always — there is no fallback locale for block copy. Declare the type
   explicitly; never infer it with `typeof mn`, which would make `copy.en.ts` conform to whatever
   `copy.mn.ts` happens to say instead of to a shared contract. Written this way, locale parity is
   a compile error, not a script's job.
3. **`manifest.ts`** — metadata only, **no component imports**:
   ```ts
   import type { BlockManifest } from '~/shell/types'
   import { en } from './copy.en'
   import { type TestimonialsCopy, mn } from './copy.mn'

   const variantNames = ['grid', 'single'] as const
   export type TestimonialsVariant = (typeof variantNames)[number]

   export const testimonials = {
     id: 'testimonials',
     variantNames,
     defaultVariant: 'grid',
     copy: { mn, en },
     requires: { npm: [], ui: [] },
   } satisfies BlockManifest<TestimonialsCopy, TestimonialsVariant>
   ```
   `as const` on the array is required: without it `defaultVariant` stops being checked against
   the list. Derive the variant union from the array (`(typeof variantNames)[number]`) rather than
   hand-writing `'grid' | 'single'` beside it — a hand-written union that lists a name the array
   omits compiles cleanly and fails only at runtime, on whichever page asks for it.
4. **`variants.ts`** — the name→component map, and the only place these components are statically
   imported:
   ```ts
   import type { ComponentType } from 'react'
   import type { BlockProps } from '~/shell/types'
   import type { TestimonialsCopy } from './copy.mn'
   import type { TestimonialsVariant } from './manifest'
   import { TestimonialsGrid } from './testimonials-grid'
   import { TestimonialsSingle } from './testimonials-single'

   export const variants = {
     grid: TestimonialsGrid,
     single: TestimonialsSingle,
   } satisfies Record<TestimonialsVariant, ComponentType<BlockProps<TestimonialsCopy>>>
   ```
   `satisfies Record<TestimonialsVariant, …>` is what makes a declared-but-unimplemented variant a
   compile error here instead of an empty preview on `/docs`. Import the manifest with
   `import type`, so the dependency stays compile-time only and `manifest.ts` never joins this
   chunk's runtime graph. The direction is always `variants.ts → manifest.ts`, never the reverse.
5. **`src/blocks/registry.ts`** — add the manifest to **both** the `manifests` and the `registry`
   object literals. `BlockId` is derived from `manifests`' keys, and `registry` is annotated
   `Record<BlockId, …>`, so adding it to one and not the other is a compile error.
6. **`src/blocks/block-modules.ts`** — add a dynamic-import entry:
   ```ts
   testimonials: () =>
     import('./testimonials/variants').then((m) => registerVariants('testimonials', m.variants)),
   ```
   This is the client's split point — one Vite chunk per entry. Point it at `variants.ts`, not
   `manifest.ts`; the manifest imports no components, so importing it here would split nothing.
7. **`src/blocks/variants.all.ts`** — import the variants and add them to the `all` map. This is
   the server's synchronous path: the prerenderer renders every page in one process and cannot
   await a per-page dynamic import before its first render.
8. **`pages.config.ts`** — add the block's id (or `{ id, variant, surface }`) to a page's `blocks`
   array. A block that is registered but on no page still renders on `/docs`.

**What actually catches a half-finished block.** Step 5 is the pivot: once the manifest is in
`registry.ts`, `BlockId` gains the new key and `tsc --noEmit` reports steps 6 and 7 as missing
properties, by name. Concretely:

| Missing | Caught by |
|---|---|
| Folder exists, not in `registry.ts` | `scripts/verify-build.mjs` (folder↔registry parity) |
| In `registry.ts`'s `manifests` but not `registry` | `tsc` — `registry` is `Record<BlockId, …>` |
| No `block-modules.ts` entry | `tsc` — `blockModules` is `Record<BlockId, …>` |
| No `variants.all.ts` entry | `tsc` — `all` is `Record<BlockId, …>` |
| Variant in `variantNames` with no component | `tsc` — `satisfies Record<XVariant, …>` in `variants.ts` |
| Component in `variants.ts` that `variantNames` omits | `tsc` — `satisfies` rejects excess keys |
| Putting components **in** the manifest object (`variants: { … }`, the pre-split shape) | `tsc` — `satisfies BlockManifest<…>` rejects the unknown property |
| A `manifest.ts` whose components are reachable from an *eagerly imported* export | **Nothing.** See below. |

Run `pnpm verify` when you are done; the folder↔registry half is a build-time check, the rest are
type errors you will see in your editor first.

**The one unguarded edit.** The last row is the only way to undo the split by accident, and it is
worth knowing precisely, because the obvious mistakes are all caught and the remaining one is not.
A bare re-export in a `manifest.ts` (`export { X } from './x'`) is harmless — Rollup tree-shakes
it, measured at **zero** change to the main chunk. What is not harmless is a manifest export that
*uses* a component value and is itself reachable from `registry.ts`'s eager import chain. That
compiles cleanly, passes `pnpm conventions`, builds, and passes `verify-build.mjs`.

What moves is **that block's own components and the chunks they share with others** — not every
block's. Measured, making `hero`'s manifest reach `HeroCentered`:

| | main chunk | `motion` chunk | `contact` chunk |
|---|---|---|---|
| split intact | 334,593 B | 123,303 B | 96,395 B |
| `hero` manifest reaches a component | **459,705 B** | **absorbed into main** | 96,323 B (unaffected) |

So one careless manifest costs the main chunk that block's components plus their shared
dependencies — here 125 KB, most of it the `motion` library that hero, features and cta all use.
Every other block keeps its own chunk, which is exactly why the gate does not notice: the
`bundle-split` assertion in `verify-build.mjs` watches for `react-hook-form` reaching the entry
chunk, and `contact` is untouched by a `hero` mistake. **`pnpm verify`, `pnpm conventions` and
`tsc` all pass on the 459 KB build.** Keep `manifest.ts` free of component imports; that is the
rule, and it is the rule *because* nothing below it will tell you.

The per-block `variants-*.js` chunks all stay in the build, including the affected block's — they
are just no longer where its weight is. Nothing looks obviously wrong.

## Adding a variant to an existing block

Two edits inside the block's folder, plus the page reference:

1. Add a component with the `BlockProps<Copy>` signature, e.g. `src/blocks/hero/hero-poster.tsx`.
2. Add its **name** to `variantNames` in that block's `manifest.ts`
   (`const variantNames = ['centered', 'split', 'poster'] as const`).
3. Map that name to the component in that block's `variants.ts`
   (`poster: HeroPoster`).

Then reference it from `pages.config.ts` as `{ id: 'hero', variant: 'poster' }`.

No change to `registry.ts`, `block-modules.ts` or `variants.all.ts` — those are per-block, and the
new variant travels inside the block's existing chunk. Steps 2 and 3 are both required and you
cannot forget the second one: `HeroVariant` is derived from `variantNames`, and `variants.ts`
constrains its map with `satisfies Record<HeroVariant, …>`, so a name added to the array with no
component is a compile error at `variants.ts`. (The reverse — a component in the map that
`variantNames` never declares — is also an error, since `satisfies` rejects excess keys.)

## Reskinning: the token surface

All visual identity lives in CSS custom properties, in two layers:

- `src/styles/theme.css` — the **system**: the fixed type scale (`--text-display`, `--text-h2`,
  ...), spacing rhythm, and the `@theme inline` block that maps token names to Tailwind utilities
  (`--color-primary`, `--font-display`, `--radius-base`, `--shadow-card`, ...). Don't edit this to
  reskin.
- `src/styles/presets/*.css` — the **skin**: font pairing (`--face-display`, `--face-body`),
  shape (`--radius`, `--section-y`, `--gutter`, `--width-page`, `--width-narrow`), elevation
  (`--elevation-card`), and the actual light/dark palette values (`--c-background`,
  `--c-primary`, ...) as OKLCH colors. This is what a new preset replaces wholesale — swap the
  single `@import` at the top of `theme.css` to point at a different file in `presets/` to reskin
  without touching any component or block.

Two presets exist today, and the swap between them is a one-line change:

```css
/* src/styles/theme.css */
@import './presets/warm.css'; /* was './presets/editorial.css' */
```

- **`editorial.css`** (default) — near-hueless neutrals with one blue accent, a small `0.5rem`
  radius, no visible card shadow, and the most generous vertical rhythm (`--section-y` up to
  `9.5rem`). Reads as a quiet, editorial/magazine layout. Its `--elevation-card` is
  `0 0 #0000` — a legal, fully transparent shadow — and **not** `none`, which looks tidier and is
  wrong: the generated `.shadow-card` utility substitutes the token into a comma-separated
  `box-shadow` list, where `none` is not a legal item and invalidates the whole declaration. It
  happens to render correctly anyway, by falling back to the initial value, which is why the bug
  is invisible. The comment at `src/styles/presets/editorial.css:12-21` says the same thing at the
  point of temptation; don't "tidy" either one.
- **`warm.css`** — an amber/terracotta palette with chroma raised on purpose, a `1rem` radius
  (visibly rounder corners), a real soft `--elevation-card` shadow, and a tighter `--section-y`
  (up to `6.5rem`). Reads as a warmer, denser, more "product" layout. Its light-mode
  `--c-primary`/`--c-ring` sit at `55%` lightness rather than the rounder `60%` a first pass
  used — at `60%` both `--c-primary-foreground` on `--c-primary` (the CTA buttons) and
  `--c-primary` as text on `--c-background` (the hero eyebrow label) measured **~4.1:1**, under
  the 4.5:1 AA floor for normal-weight text; `55%` clears both at **~5.1:1** with the same hue and
  chroma. Measured Lighthouse accessibility is **1.00** on both locales, both presets, mobile and
  desktop.

Radius, shadow, colour temperature and density all differ between the two — deliberately, so a
preset swap reads as a different design, not a recolour. A third preset slot is open: add a file
under `presets/` with the same variable set and repeat the one-line `@import` swap.

"The same variable set" is enforced, not advisory. `pnpm conventions` reads every `var(--…)`
referenced inside `theme.css`'s `@theme inline` block and asserts that **every** file in
`presets/` declares all of them in `:root` — including presets that are not the one currently
imported. It checks the reverse direction too: a token a preset declares that `@theme inline`
never maps, and that nothing else in the preset references, is reported as dead weight (a token
built on internally, like a shared `--brand-hue`, is exempt because the preset itself uses it).
This exists because the failure is otherwise invisible: `--color-ring: var(--c-ring)` with no
`--c-ring` is invalid at computed-value time, so the focus outline silently does not render, and
both `pnpm verify` and Lighthouse stay green — the accessibility audit measures contrast, not
whether a focus ring resolved.

The fastest way to see either preset is **`/docs`** (see below) — its Tokens section renders
every colour and type token live from whichever preset is imported, and its Blocks section
previews every block and variant at true page geometry (each preview supplies its own `Section`
and `Container`, so it shows exactly what a real page renders).

## `/docs`: the living developer reference

`/docs` is a generated, English-only reference page — every design token, every block and its
variants (rendered from the live registry, not a fixture), and the resolved
`pages.config.ts`/`site.config.ts` for whichever config just built. It replaced an earlier
`/debug` route and cannot drift from the code, because it reads the code directly rather than
restating it.

It is not part of the site a visitor sees, kept out by three separate mechanisms:

1. **Not prerendered.** `/docs` is absent from `pages.config.ts`, so `enumerateUrls` never emits
   it and the `tanstackStart` plugin never builds it — it simply 404s on a static deploy.
2. **Absent from the sitemap.** `sitemap.xml` is built from the same `enumerateUrls` call, so the
   same absence keeps it out of that too.
3. **`noindex, nofollow`**, for whichever deploy renders it live (an SSR deploy, since a static
   one already 404s per (1)). This is the *only* mechanism on an SSR deploy, which is exactly why
   `robots.txt` deliberately does **not** `Disallow: /docs`: a `Disallow` stops a crawler from
   ever fetching the page, so it would never read the `noindex` meta either, and a URL linked from
   elsewhere would still get indexed URL-only — precisely what the `noindex` exists to prevent.
   `/docs` has to stay fetchable for its own exclusion to work. `scripts/verify-build.mjs` fails
   the build if a `/docs` `Disallow` or sitemap entry reappears; `scripts/check-conventions.mjs`
   fails if the `noindex` meta is removed.

## The Cyrillic font requirement

Both font families (`@fontsource-variable/inter`, `@fontsource-variable/manrope`) **must** have
Cyrillic coverage, because Mongolian Cyrillic uses letters (`ө`, `ү`) outside the basic Cyrillic
Unicode block, in the "Cyrillic Extended" range. If you swap a preset's `--face-display`/
`--face-body`, verify the replacement font ships a `cyrillic` *and* `cyrillic-ext` subset — a
font that only covers `cyrillic` renders Mongolian text with `ө`/`ү` falling back to a
mismatched system font, which is easy to miss if you only proofread the English copy.

This also means a Mongolian page genuinely ships more font-subset weight than the English one
(extra network requests for `cyrillic`/`cyrillic-ext` files on top of `latin`) — real, unavoidable
bytes, not a bug. `src/shell/seo/build-head.ts` preloads the current locale's critical
(above-the-fold) font subset for this reason; see [Lighthouse budget](#lighthouse-budget) for why.

## The three env flags

Set as environment variables at build/dev time; each swaps a `~/motion`, `~/theme`, or `~/submit`
import alias in `vite.config.ts` — never branched on inside a component.

| Flag | Values | Effect |
|---|---|---|
| `KIT_ANIMATION` | `on` (default), `off` | `on` aliases `~/motion` to `src/motion.animated.tsx` (real entrance/scroll animations via `motion/react`). `off` aliases it to `src/motion.noop.tsx` — plain passthrough components, and the `motion` library is not in the bundle at all (verified: 0 matches for `motion-dom`/`framer` in `dist/client/assets/` when off). |
| `KIT_SUBMIT` | `endpoint` (default), `server` | `endpoint` aliases `~/submit` to `src/submit.endpoint.ts`, which POSTs to `VITE_CONTACT_ENDPOINT` (a client-side fetch to an external URL — set that env var). `server` aliases it to `src/submit.rpc.ts`, a TanStack Start server function (`createServerFn`) that runs on your own server. Both validate with the same `submissionSchema`, so neither mode is the "weaker" one. |
| `KIT_CONFIG` | `default` (default), `onepage` | Selects which directory `~/config` resolves to: `default` → `src/config/`, `onepage` → `configs/smoke-onepage/`. Also selects which `pages.config`/`site.config` `vite.config.ts` itself reads to drive prerendering and SEO emission — the alias alone isn't enough, since the build driver needs the same page list to know what to prerender (see [Swapping the whole config](#swapping-the-whole-config-configs)). |

`site.theme.mode` (`'light' \| 'dark' \| 'both'`, set in `site.config.ts`, not an env flag) works
the same way: `'both'` aliases `~/theme` to `src/theme.both.tsx` (toggle + no-flash script
included), anything else aliases it to `src/theme.single.tsx` — a single-mode build ships **no**
theme-switching code at all, not merely a hidden toggle.

## Swapping the whole config: `configs/`

`configs/smoke-onepage/` is a complete second config — `pages.config.ts` (one page holding every
existing block) and `site.config.ts` (light-only) — used only to prove the config-swapping
premise end to end. It contains **no components and no overrides**, only config, and requires
zero edits under `src/blocks/` or `src/shell/` to work.

```bash
pnpm smoke:onepage   # KIT_CONFIG=onepage KIT_ANIMATION=off KIT_SUBMIT=endpoint
```

produces a working single-page, light-only, unanimated site: `hero` (`split` variant), `features`,
`cta` and `contact`, all on one page, where the hero's primary CTA resolves to `#contact` (an
in-page anchor) instead of `/contact` (a page link) — same components, same copy, different
config.

If you add a real second scaffolded config, remember: **`vite.config.ts` itself must branch on
`KIT_CONFIG` too**, not just the `~/config` alias. The alias only affects app code that Vite
bundles; `vite.config.ts`'s own `pages`/`site` (used to build the TanStack Start `prerender.pages`
list and to drive `emitSeoFiles`) are read directly by the config file at build-config-eval time,
before any aliasing applies.

## The contact form

`src/blocks/contact/contact-form.tsx` uses `react-hook-form` + `zod` (`submissionSchema` in
`src/submit-schema.ts`), shared by both `~/submit` variants.

## Gotchas that cost real debugging time

- **`VITE_CONTACT_ENDPOINT` must send CORS headers.** In `endpoint` mode the browser POSTs
  cross-origin, so an endpoint without `Access-Control-Allow-Origin` fails at preflight. The form
  surfaces this as the same generic error a code bug would produce — it is not one. If a client's
  contact form "silently fails," check this first.
- **The contact form's 2-second timing guard rejects fast submissions** — including your own
  while testing it manually. That's the spam check working as intended, not a bug.
- **`<input type="email">` triggers native browser validation** that blocks submission before any
  handler runs, so a malformed email never reaches the Zod schema — don't go looking for a schema
  bug that isn't there.
- **`submit.rpc.ts` is deliberately not named `submit.server.ts`.** TanStack Start's client-import
  protection refuses to bundle any `**/*.server.*` file into the client by filename, regardless of
  content. This file is the sanctioned client-safe `createServerFn` stub the client is meant to
  import, so renaming keeps the protection intact for every *other* file instead of carving out an
  exception that the next person copying this pattern could get wrong.
- **React logs `Invalid DOM property 'hreflang'. Did you mean 'hrefLang'?` in `pnpm dev`.**
  Expected and deliberate — the lowercase form is what SEO tooling reads from the built HTML, and
  `scripts/verify-build.mjs` asserts on the lowercase attribute. Don't "fix" it by renaming to
  `hrefLang`; that would just ship the wrong casing.
- **A light-only or dark-only build ships no theme-switching code at all** — not a hidden toggle,
  none of the JS. Same for `KIT_ANIMATION=off` and the `motion` library.
- **Prerendered files are `<path>/index.html`, and some static hosts serve them by literal
  filename** rather than rewriting `/` to `index.html` while keeping the browser's address bar at
  `/` (Lighthouse CI's own static server, used by `pnpm lighthouse`, is exactly this). Without
  care, that leaves `window.location.pathname` as `/index.html` on hydration, which the router
  won't match to any page — `src/shell/pages/resolve-request.ts`'s `normalizePath` collapses a
  trailing `/index.html` to `/` for exactly this reason. If you see a page flash to a "Not Found"
  state right after hydrating, check this first.

## Lighthouse budget

`lighthouserc.json` (mobile) and `lighthouserc.desktop.json` (desktop) each assert on **all four**
prerendered pages — `/index.html`, `/en/index.html`, `/contact/index.html` and
`/en/contact/index.html` — against the **default** config's build (`KIT_ANIMATION=on`,
`KIT_SUBMIT=endpoint`, `KIT_CONFIG=default`):

- `categories:seo` ≥ 1
- `categories:accessibility` ≥ 0.95
- `categories:performance` ≥ 0.85 (mobile) / ≥ 0.95 (desktop)
- `cumulative-layout-shift` ≤ 0.01

Every one of these is a hard `error`, on **both** Lighthouse presets — mobile and desktop — and
on both token presets (`editorial`, `warm`). Nothing here is a `warn`.

Including `/contact` matters because it is the page carrying the 96 KB form chunk and the kit's
only interactive surface: until it was added, both its performance and its **form accessibility**
were unmeasured by anything.

`pnpm lighthouse` runs Lighthouse CI's default **mobile** preset (throttled CPU + network) — the
harder, more representative run for these sites. `pnpm lighthouse:desktop` uses
`lighthouserc.desktop.json`. Each runs 5 times per URL so the reported score is a stable median.
Each script clears `.lighthouseci/` before running, so `pnpm lighthouse && pnpm lighthouse:desktop`
is safe to chain — without that, the second run's assert step would pick up the first preset's
leftover reports alongside its own and could fail on a URL that was never part of its own run.

**Each script runs `pnpm build` first**, and that is load-bearing rather than tidy. `lhci` reads
whatever is sitting in `dist/client`; the smoke scripts overwrite it with a *different* config's
output. Run in the documented gate order (`… && pnpm smoke:onepage && pnpm lighthouse`), the
Lighthouse step would otherwise measure the one-page, light-only, unanimated smoke build while
reporting it against the default config's budget — and with `/contact` in the URL list it would
simply fail, since that build has no contact page. The rebuild makes each script measure the build
it says it measures.

### Current status

Measured on the default config's build with the **`editorial`** preset — the committed default,
and the only preset any committed configuration has ever built. Task 6 measured `warm` through a
temporary local `@import` swap and found the numbers unchanged within run-to-run noise, which is
expected (a preset swap moves CSS variables and fonts, not the JavaScript the performance score is
dominated by) but is not reproducible from anything in the repository. See
[Known limitations](docs/superpowers/known-limitations.md) before treating the `warm` figures as
measured.

Median of 5 runs per URL, all four pages:

| Page | Mobile perf | Desktop perf | Accessibility | SEO | CLS |
|---|---|---|---|---|---|
| `/` (mn) | **0.90** | 1.00 | 1.00 | 1.00 | 0.000 |
| `/en` | 0.94 | 1.00 | 1.00 | 1.00 | 0.000 |
| `/contact` (mn) | 0.91 | 1.00 | 1.00 | 1.00 | 0.000 |
| `/en/contact` | 0.95 | 1.00 | 1.00 | 1.00 | 0.000 |

All comfortably clear their floor (mobile ≥ 0.85, desktop ≥ 0.95) and every assertion is a hard
failure — there is no relaxed severity left on either preset. Accessibility is 1.00 on the contact
pages too, which is the first machine check the form has ever had. Mongolian mobile is the harder case
for one inherent, unavoidable reason: a bilingual page carries two font subsets. The chrome
contains Latin text — the brand name, the email address, the phone number — while the content is
Cyrillic, so `unicode-range` correctly fetches both subsets, roughly twice the English page's font
payload. The Mongolian page will always be the harder one.

The other original cause — blocks eagerly bundled into one 559 KB chunk that every page loaded,
including the contact form's `react-hook-form` and `zod` on pages with no form — is fixed: block
components are now resolved via dynamic `import()` and awaited *before* `hydrateRoot`, so the main
chunk dropped to 333 KB raw (107 KB gzip) and each page's `<head>` carries a `modulepreload` for
exactly the chunks it needs. See
[Known limitations](docs/superpowers/known-limitations.md#resolved-pre-hydration-block-imports)
for the full mechanism, the `React.lazy` approach that was tried first and reverted (it halved the
bundle but regressed CLS to 0.169), and why CLS staying at 0 through this change was the real
constraint, not raw bundle size.
