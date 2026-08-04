# Landing Kit — Design

- **Date:** 2026-08-01
- **Status:** Approved, ready for implementation planning
- **Scope:** The boilerplate only. The scaffolding CLI is a separate later project.

## 1. Context

An internal boilerplate for building client landing pages at speed. Primary audience is
the agency itself, not the public, so the design is allowed to be opinionated and to skip
broad configurability.

A scaffolding CLI is planned for later. It will ask for navigation style, animation,
theme, and which sections to include. The CLI is **not** built here, but its existence is
a hard design constraint: the boilerplate must be composable so the CLI can assemble a
project from parts rather than mutate a template.

### Goals

1. Ship a client landing page in hours, in Mongolian and English.
2. Technically excellent SEO by default, provable rather than claimed.
3. Structure that a composition-based CLI can consume later without rework.

### Non-goals

- Public/open-source distribution, or commercial sale.
- A headless CMS. Copy lives in the repo; changes ship via git.
- A blog / content engine. Deferred to its own project (see §13).
- Runtime-generated OG images.
- Unit and end-to-end test suites (deliberate; see §11).

## 2. Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Internal/agency use is the primary audience | Permits opinionated defaults, thin docs |
| D2 | Prerender-first, deploy adapter swappable | Landing pages are static content; strongest SEO posture. Must also support Cloudflare / Vercel / Netlify / self-hosted Node, since projects vary |
| D3 | Full `mn` + `en` locale routing | Most client projects need both; hardest thing to retrofit |
| D4 | Default locale unprefixed | `/` and `/about` are Mongolian; `/en/`, `/en/about` are English. Primary-market visitors type the bare domain and should not eat a redirect |
| D5 | Default locale is configurable per project, defaults to `mn` | Avoids hardcoding an assumption |
| D6 | SEO scope = technical SEO + enforced performance budget | Content marketing is the missing ranking lever, but it is a separate subsystem |
| D7 | Copy lives in the repo, devs only | Low edit frequency; enables compile-time locale parity checking |
| D8 | Architecture: block registry with composition | The CLI adds selected blocks rather than deleting unselected ones |
| D9 | Single package now; workspace split only when the CLI arrives | The block contract is the expensive thing to retrofit, not the folder layout |
| D10 | Multi-page is the CLI default; one-page is opt-in | More indexable URLs targeting distinct search intent |
| D11 | TypeScript pinned to 6.x | TS 7 is a full compiler rewrite; toolchain consumers lag major rewrites |
| D12 | Visual design = token presets × per-block layout variants | The pattern every comparable kit converged on; the two axes are orthogonal, so they compose instead of multiplying |
| D13 | All variants of a block share one copy type | Swapping layout stays a one-word change with copy preserved in both locales |

### Rejected alternatives

- **Template-subtraction architecture** (one full app the CLI prunes). Rejected: the CLI
  would be coupled to the *current contents* of shared files (page composition, i18n
  dictionaries, nav config, JSON-LD builder). Every redesign risks silently breaking a
  mutation, and failures are silent — orphaned copy keys and dead dependencies shipped to
  a client. Composition fails loudly instead.
- **Monorepo of published packages** (`@tanasoft/landing-*`). Rejected: agency landing
  pages are heavily redesigned per client, so shared section packages would be forked or
  escape-hatched constantly, and every client site would inherit coupling to our release
  cadence.
- **Locale-neutral `data.ts` per block** (to avoid duplicating prices across locales).
  Rejected: prices genuinely are locale-specific here (₮ on the Mongolian page, likely $
  on the English one), so they belong in copy.
- **Whole-site design skins ("design 1–4" as complete looks).** Rejected: skins multiply
  combinatorially, cannot be mixed, and each needs visual QA across every block. No
  comparable kit ships them; they all ship tokens × section variants instead (§8).
- **Separate block folders per layout** (`hero-centered`, `hero-split`). Rejected: would
  force re-authoring copy in two locales whenever a client changed their mind about a
  layout. Variants live inside one block folder instead (§8).
- **`nav.mode: 'anchor' | 'page'` config flag.** Rejected as redundant — the link
  resolver (§5) derives the correct href from whether the target is a page or a block,
  which also handles the mixed case (a multi-page site whose nav mixes page links with
  anchors into the homepage).

## 3. Repository layout

```
landing_kit/
├── docs/superpowers/specs/
├── scripts/
│   └── verify-build.mjs          # post-build assertions, plain Node, no framework
├── src/
│   ├── blocks/                   # the registry
│   │   ├── registry.ts
│   │   ├── hero/
│   │   ├── logos/
│   │   ├── features/
│   │   ├── testimonials/
│   │   ├── pricing/
│   │   ├── faq/
│   │   ├── cta/
│   │   └── contact/
│   ├── shell/
│   │   ├── blocks/               # BlockRenderer, manifest types
│   │   ├── seo/                  # head(), JSON-LD graph, sitemap + robots generation
│   │   ├── i18n/                 # locale resolution, copy selection
│   │   ├── layout/               # Section, Container — the layout primitives
│   │   ├── chrome/               # Header, Footer, LocaleSwitcher, ThemeToggle
│   │   ├── motion.ts             # animation boundary  (motion.noop.ts is the variant)
│   │   └── submit.ts             # form submission boundary
│   ├── components/ui/            # shadcn, vendored
│   ├── routes/
│   ├── styles/
│   │   ├── theme.css             # Tailwind v4 @theme tokens; selects a preset
│   │   └── presets/              # token presets: palette, fonts, radius, density
│   ├── pages.config.ts
│   └── site.config.ts
├── biome.json
└── package.json
```

Boundary discipline in a single package is enforced by a Biome `noRestrictedImports` rule
(see §7). Moving to a workspace later is `git mv` plus adding `package.json` files, with
no design rework, because the block contract does not change.

## 4. The block contract

A block is a folder owning everything it needs. Nothing about a block lives outside its
folder except one registry line.

```
src/blocks/pricing/
├── manifest.ts       # declaration read by the shell (and later the CLI)
├── pricing.tsx       # the component
├── copy.mn.ts        # Mongolian copy — source of truth for the copy type
├── copy.en.ts        # English copy — must structurally match copy.mn.ts
└── schema.ts         # JSON-LD contribution
```

### Types

```ts
// src/shell/blocks/types.ts
export type Locale = 'mn' | 'en'

export type BlockProps<C> = {
  copy: C                            // already resolved to the active locale
  site: SiteConfig
  resolve: (target: string) => string // link resolver, see §5
  surface: Surface                    // assigned by the renderer, see §8
  anchorId: string                    // unique per instance, see below
}

export type BlockSchema<C> = (ctx: {
  copy: C
  site: SiteConfig
  page: PageConfig
}) => JsonLdNode[]

export type BlockManifest<C = any, V extends string = string> = {
  id: string
  variants: Record<V, (props: BlockProps<C>) => ReactNode>
  defaultVariant: V                      // constrained to a key of `variants`
  copy: Record<Locale, C>                // ONE copy shape, shared by every variant
  nav?: { labelKey: keyof C & string }   // omit → block never appears in nav
  schema?: BlockSchema<C>                // omit → contributes no structured data
  requires?: { npm?: string[]; ui?: string[] }
}
```

Variants are the layout axis of the design system (§8). `V` is inferred through
`satisfies`, so `defaultVariant` naming a nonexistent variant is a compile error.

**Blocks with a single layout still declare `variants`**, by convention
`{ variants: { default: Contact }, defaultVariant: 'default' }`. Slight ceremony in
exchange for the renderer having exactly one code path and blocks gaining variants later
without a shape change.

`requires` lets the future CLI write a correct `package.json` and run the right
`shadcn add` commands. It is accurate dependency documentation regardless.

### Blocks are pure, prop-driven components

Blocks read no context and no hooks for data. Everything arrives as props. Consequences:

- A block can be rendered anywhere with a literal copy object — no i18n provider, no
  router, no theme provider.
- The CLI can compose blocks freely, because there is no hidden wiring to reproduce.

**Anchor ids belong to the renderer, not the block.** A page may carry the same block twice —
two CTAs, or a hero above and below a feature list — and a block hardcoding
`<Section id="cta">` would then emit duplicate ids: invalid HTML, plus anchor links that always
jump to the first instance. The renderer therefore assigns `anchorId`, using the block id for
the first occurrence and `<id>-2`, `<id>-3` for later ones. `resolve('cta')` targets the first
instance, which is the useful default.

### Locale parity is a compile error

```ts
// copy.mn.ts — declares the type, then the default-locale copy
export type PricingCopy = {
  heading: string
  navLabel: string
  tiers: { name: string; price: string }[]
  /** `compact` variant only. */
  footnote?: string
}
export const mn: PricingCopy = { heading: 'Үнэ', navLabel: 'Үнэ', tiers: [/* … */] }

// copy.en.ts
import type { PricingCopy } from './copy.mn'
export const en: PricingCopy = { heading: 'Pricing', navLabel: 'Pricing', tiers: [/* … */] }
```

The type is declared explicitly rather than inferred via `typeof mn`, because inference from a
literal makes every field required — and variant-specific fields must be optional for two
variants to share one copy type. Parity comes from annotating both locales with the same type,
not from deriving one from the other.

A missing or misspelled English key fails `tsc`, rather than rendering a blank section in
production. This replaces the locale-parity test suite.

### Structured data stays in sync with copy

```ts
export const schema: BlockSchema<PricingCopy> = ({ copy }) => [
  { '@type': 'FAQPage', mainEntity: copy.faqs.map(/* … */) },
]
```

The shell concatenates every rendered block's contribution into one `@graph`. Adding an
FAQ block to a page emits `FAQPage` markup automatically — nobody has to remember.

### Registry

```ts
// src/blocks/registry.ts
export const registry = {
  hero, logos, features, testimonials, pricing, faq, cta, contact,
} satisfies Record<string, BlockManifest<any>>

export type BlockId = keyof typeof registry
```

The `any` is deliberate and confined to this one line: each manifest is individually typed
against its own copy shape at its definition site, and the registry only needs to prove
that every entry *is* a manifest. Using `unknown` here would make `keyof C` collapse to
`never` and break the `nav.labelKey` constraint.

One hand-written line per block, in exchange for `BlockId` being a literal union — so
page configs autocomplete and typos are compile errors. `scripts/verify-build.mjs`
asserts every folder under `src/blocks/` is registered inside the exported registry object —
comments stripped first, so a `// TODO: register logos` cannot satisfy it — meaning a
half-added block fails the build.

**Adding a block** is: copy an existing folder, edit `id` / component name / copy inside
it, add one registry line, add the id to a page. The SEO layer, nav, and sitemap require
no changes.

## 5. Pages, navigation, and link resolution

Because `mn` + `en` require locale-prefixed URLs, TanStack Router is always present.
"One page vs. router" is therefore not a routing fork — it is *how many content routes
exist*, expressed as data:

```ts
// src/pages.config.ts — one-page
export const pages = [
  { id: 'home', path: '/', blocks: ['hero', 'features', 'pricing', 'faq', 'contact'],
    seo: { mn: { title: '…', description: '…' }, en: { title: '…', description: '…' } } },
]

// src/pages.config.ts — multi-page
export const pages = [
  { id: 'home',    path: '/',        blocks: [{ id: 'hero', variant: 'split' }, 'features', 'cta'],
    seo: { /* … */ } },
  { id: 'pricing', path: '/pricing', blocks: ['pricing', 'faq', 'cta'],     seo: { /* … */ } },
  { id: 'contact', path: '/contact', blocks: ['contact'],                   seo: { /* … */ } },
]
```

```ts
export type BlockRef =
  | BlockId                                                    // → block's defaultVariant
  | { id: BlockId; variant?: string; surface?: Surface }        // explicit overrides

export type PageConfig = {
  id: string
  path: string
  blocks: BlockRef[]
  seo: Record<Locale, { title: string; description: string; ogImage?: string }>
}
```

The bare-string shorthand keeps the common case terse. `variant` selects a layout (§8) and
`surface` opts out of automatic surface alternation (§8).

**Blocks are identical in both modes and never know which they are in.** Everything
mode-specific derives from this config: nav rendering, sitemap entries, per-page
metadata, whether `BreadcrumbList` is emitted, and the prerender route list.

### Link resolution

Blocks must never hardcode link targets. They reference targets **by id** and the shell
resolves the href:

```tsx
<a href={resolve('pricing')}>…</a>
```

Resolution rules, in order:

1. `target` matches a page id → that page's path, locale-prefixed as needed.
2. `target` is a block id on the **current** page → `#<block-id>`.
3. `target` is a block id on **another** page → that page's path + `#<block-id>`.
4. No match → `resolve()` throws. Because every page is prerendered at build time, an
   unresolvable target fails the build rather than shipping a dead link.

This is why no `nav.mode` flag is needed, and why flipping between one-page and
multi-page cannot break CTAs. The resolver also applies the locale prefix, keeping blocks
locale-agnostic.

### Navigation

`site.config.ts` holds an explicit ordered list of nav targets. Labels come from the
page's `seo.title` when the target is a page, or the block's `nav.labelKey` when it is a
block. One-page mode renders anchors with scroll-spy; multi-page renders route links with
active state; mixed navs work without special handling.

### Routing implementation

Pages are known at build time, so routing is config-driven rather than one file per page:
a single splat route resolves `locale + page` from the pathname against `pages.config.ts`,
renders the matching blocks, and computes `head()`. Prerendering enumerates
`pages × locales`, so every URL still emits static HTML.

Trade-off accepted: no per-route code splitting. Irrelevant here — landing pages are
small and prerendered. If the installed TanStack Router version supports optional path
segments cleanly, an optional-locale-prefix route tree is an acceptable equivalent
implementation; the design does not depend on which is used.

## 6. SEO layer

Three inputs feed everything — `site.config.ts`, `pages.config.ts`, and block manifests.
No SEO concern is ever hand-maintained inside a component.

### Per-route `head()`

- Title, using a site-name template; description.
- Self-referencing **absolute** canonical for the active locale.
- `hreflang` alternates for `mn`, `en`, and `x-default`.
- Open Graph and Twitter card tags; `ogImage` per page, falling back to a site default.
- `<html lang>` set to the active locale.

### JSON-LD

A single `@graph` script tag per page:

- `WebSite` and `Organization` — or `LocalBusiness` when the client has a physical
  address, which applies to most Mongolian businesses.
- `WebPage`.
- `BreadcrumbList` on multi-page only.
- Every rendered block's contribution.

### Generated files

`sitemap.xml` and `robots.txt` are generated at build from `pages × locales`. Sitemap
entries include `xhtml:link` alternates per URL, which is what Google expects for a
bilingual site.

### Site config

```ts
export type SiteConfig = {
  name: string
  url: string                   // absolute origin, e.g. https://example.mn
  defaultLocale: Locale
  locales: Locale[]
  organization: {
    kind: 'Organization' | 'LocalBusiness'
    legalName?: string
    logo: string
    email?: string
    phone?: string
    address?: { country: string; region?: string; city?: string; street?: string; postalCode?: string }
    sameAs?: string[]           // social profiles
  }
  nav: { target: string }[]
  theme: { mode: 'light' | 'dark' | 'both'; default?: 'light' | 'dark' }
}
```

### Performance (Core Web Vitals are a ranking input)

- **Self-hosted fonts with an explicit Cyrillic subset.** Most font pipelines subset Latin
  only, so Mongolian text silently falls back to a system font — visible shift and worse
  LCP. Subset `latin` and `cyrillic` separately so English pages do not download Cyrillic
  glyphs. Preload only the face used above the fold; `font-display: swap`.
- Images carry explicit dimensions. Hero image eager with `fetchpriority="high"`;
  everything below the fold lazy.
- Animations are restricted to `transform` and `opacity`, so entrance animations cannot
  contribute to CLS.
- Lighthouse CI budget, enforced in CI (§11).

### Honest limitation

This produces a technically excellent site, which reliably wins brand-name queries and
Core Web Vitals comparisons. It does not by itself outrank an established competitor on a
competitive commercial keyword — that requires the deferred content engine (§13).

## 7. The three swappable boundaries

Theme, animation, and form submission share one shape: a single module defines the
surface, blocks import only from it, and the variant is selected by config or build
alias. This is what makes them CLI options rather than CLI rewrites.

### Theme

Tokens in `src/styles/theme.css` using Tailwind v4 `@theme`, with shadcn's semantic names
(`background`, `foreground`, `primary`, `muted`, …) so shadcn components work untouched.
Their *values* come from the selected token preset (§8); what follows covers only the
light/dark/both mode mechanics.

- `light` / `dark` only: tokens alone. No provider, no toggle, no persistence — strictly
  *less* code.
- `both`: adds the toggle, `localStorage` persistence, `prefers-color-scheme` as initial
  default, and a small inline script in `<head>` that applies the class **before first
  paint**. Without that script, a prerendered dark-mode site flashes white on every cold
  load.

`site.config.ts`'s `theme.mode` is the single source of truth, read at build time: the
shell omits the toggle, the persistence logic, and the inline script for single-mode
builds. The CLI additionally does not copy those files at all. Both paths agree, so mode
is never a runtime branch a client site pays for.

### Motion

Blocks never import `motion` directly. They import presets:

```tsx
<FadeIn delay={0.1}>…</FadeIn>
<Stagger>…</Stagger>
<Reveal>…</Reveal>     // on scroll into view
```

`src/shell/motion.noop.ts` exports the identical API rendering plain elements. Selecting
"no animation" is a build alias swap plus dropping one dependency; no block is edited.

A Biome `noRestrictedImports` rule forbids importing `motion` anywhere except
`src/shell/motion.ts`, so the boundary cannot erode. Presets also mean
`prefers-reduced-motion` is honored in one place rather than twelve — an accessibility
requirement and a Lighthouse line item.

### Form submission

`zod` schema plus `react-hook-form`, with the schema shared between client and server so
validation cannot diverge. All submission goes through one function:

```ts
// src/shell/submit.ts  → build alias to one of:
//   submit.server.ts     TanStack Start server function (SSR deploys)
//   submit.endpoint.ts   POST to VITE_CONTACT_ENDPOINT (static deploys)
```

The contact block is identical either way: it awaits `submitContact(data)` and renders
idle / submitting / success / error. Spam handling is a honeypot field plus a
submit-timing check — no CAPTCHA by default, since it costs real CWV and conversion on a
landing page. The server implementation revalidates with the same schema, because the
client can be bypassed.

`react-hook-form` was chosen over TanStack Form on maturity grounds despite being less
stack-coherent; it sits behind this boundary and can be swapped.

## 8. Visual design system

This follows the pattern common to every comparable kit — [Untitled UI](https://www.untitledui.com/react/docs/theming),
[Launch UI](https://www.launchuicomponents.com/), [Page UI](https://pageui.shipixen.com/),
[Velora UI](https://github.com/ColorlibHQ/velora-ui): copy-paste ownership, the *look*
controlled by CSS tokens, the *layout* controlled by per-section variants. Two orthogonal
axes, which is why they do not multiply: tokens never change layout, variants never change
palette.

### System vs. skin

The organising idea. Agency landing pages must look different per client — that is the
product — but a boilerplate wants consistency. So:

- **The system is shared and fixed:** spacing rhythm, type scale, container widths,
  breakpoint behaviour, section vertical rhythm, focus states. This is what makes eight
  independently-authored blocks read as one page.
- **The skin is per-client and swappable:** palette, font pairing, radius scale,
  border-vs-shadow character, density. One token file.

Reskinning a client site means editing tokens and a font pairing. It never means touching
a block.

### Axis 1 — token presets

3–4 named presets under `src/styles/presets/`, each setting palette (light *and* dark),
font pairing, radius scale, density, and border-vs-shadow character. A developer picks one
in `theme.css` and then tunes variables from there. This is the "design 1–4" affordance,
and it is cheap because it is only token files — no component work, no per-preset visual QA
across blocks.

Token names follow shadcn's semantics (`background`, `foreground`, `primary`, `muted`, …)
so shadcn components and the wider ecosystem work untouched, and so any developer arriving
from a shadcn project already knows how to change the look.

**Dark palettes are authored, not derived.** Inverting lightness values reads muddy; dark
surfaces need their own elevation steps and lower saturation. Since `both` is a supported
theme mode, each preset ships both palettes deliberately.

### Axis 2 — block variants

A block is one section *concept*; a variant is one way to lay it out.

```ts
export const manifest = {
  id: 'hero',
  variants: { centered: HeroCentered, split: HeroSplit, screenshot: HeroScreenshot },
  defaultVariant: 'centered',
  copy: { mn, en },        // ONE copy shape, shared by every variant
  // …
}
```

**The load-bearing constraint: all variants of a block share a single copy type**, with
variant-specific fields optional. This is what makes "the client wants the split hero
instead" a one-word change with all copy preserved. Separate `hero-split` / `hero-centered`
block folders were rejected for exactly this reason — they would force re-authoring copy in
two locales every time someone changed their mind about a layout.

### Layout primitives

Blocks never write raw padding or max-width values. They compose:

```tsx
<Section id="pricing" surface="muted">
  <Container>…</Container>
</Section>
```

`<Section>` owns vertical rhythm and the anchor id that `resolve()` targets (§5);
`<Container>` owns max-width and gutters.

Enforcement is split by what each tool can actually see. Biome's `noRestrictedImports`
handles the module boundaries (§7). Class strings are invisible to Biome, so
`scripts/check-conventions.mjs` (§11) scans `src/blocks/` for vertical section padding,
`max-w-*`, `container`, `min-h-screen`, and raw `<section>` elements. Same effect as a lint
rule, different mechanism — Biome cannot lint Tailwind class strings.

**Automatic surface alternation:** because the renderer knows block order, it assigns
alternating `surface` values by default, so consecutive sections do not stack into
identical boxes — the most common reason a sectioned landing page looks cheap. The renderer
passes the resolved surface to the block via `BlockProps.surface` (§4), which the block
hands to its own `<Section>`; blocks own their `<Section>`, so the surface must travel as a
prop rather than as a wrapper. A page's `BlockRef` can override it explicitly.

### Type scale

Fluid, `clamp()`-based, defined once in tokens. Blocks carry no per-breakpoint font-size
overrides.

### Tokens generate Tailwind utilities

Tokens are registered in Tailwind v4's `@theme` so the framework generates real utilities
from them — `py-section`, `px-gutter`, `max-w-page`, `text-display`, `rounded-base`,
`font-display`, `bg-muted`. Components therefore style themselves with ordinary utility
classes, not inline `style` attributes and not arbitrary-value escapes like
`text-[length:var(--text-display)]`.

Colour, radius, spacing and width tokens are registered with `@theme inline` pointing at the
preset's own variables, so switching preset — or toggling `.dark` at runtime — changes the
utilities' resolved values without a rebuild. The type scale is registered statically,
because scale is part of the system rather than the skin.

Practical consequence: a developer restyling a client site works in the vocabulary they
already know from any Tailwind project, and a block's markup stays readable.

### Responsiveness

Mobile-first, using Tailwind's default breakpoints — `sm` 40rem, `md` 48rem, `lg` 64rem,
`xl` 80rem. Concretely:

- **No horizontal overflow at 320px.** The narrowest realistic phone is the floor, not 375px.
- **Fluid before breakpoints.** Section padding, gutters and type are `clamp()`-based, so most
  reflow happens continuously and breakpoints handle only structural changes (a one-column
  stack becoming two).
- **Navigation collapses.** Above `md` the header shows inline links; below it, a disclosure
  menu built on `<details>`/`<summary>` so it works in prerendered HTML before hydration —
  important when the whole point is fast static pages.
- **Tap targets ≥ 44px** on all interactive chrome, which is also an accessibility-budget item.
- **Every block variant is verified at four widths** — 375, 768, 1280, 1536 — plus a 320px
  overflow check. A variant that only works on desktop is not done.

### Fonts: a hard Cyrillic constraint

Most fashionable display faces have **no Cyrillic coverage**. Choosing one means Mongolian
headings silently fall back to a system font — both an aesthetic failure and the LCP/CLS
problem described in §6. Therefore:

- The reference pairing is chosen from families with real Cyrillic support (Inter, Manrope,
  IBM Plex Sans, Golos Text, Noto Sans and similar).
- "Has Cyrillic coverage" is a documented requirement for any per-client font swap.
- Subsetting stays as specified in §6: `latin` and `cyrillic` as separate subsets.

### Accessibility

Contrast ratios chosen to satisfy the Lighthouse accessibility budget (§11) in both
palettes, focus ring as a token rather than per-component, and minimum tap-target sizing in
the primitives.

### Documentation for other developers

One `docs/` page listing the token surface and the available variants per block. Combined
with blocks being pure prop-driven components with no hidden context (§4), a developer can
read a single folder and fully understand a section.

## 9. v1 scope

**Shell chrome** (cross-page, not blocks): Header with nav, locale switcher, and theme
toggle; Footer driven by `site.config.ts`.

**Blocks (8), 14 variant components total:**

| Block | Variants |
|---|---|
| `hero` | `centered`, `split`, `screenshot` |
| `features` | `grid`, `alternating` |
| `pricing` | `cards`, `compact` |
| `testimonials` | `grid`, `quote` |
| `cta` | `banner`, `split` |
| `logos` | `default` |
| `faq` | `default` |
| `contact` | `default` |

**Token presets (3).** Three, not four — each preset is cheap to author but still needs a
look at every block in both palettes before it can be trusted.

**Every variant must render correctly under `motion.noop`.** No variant may depend on
animation to be legible — so no marquee-style variants in v1, since their static fallback is
a different layout rather than the same layout held still.

**A `/variants` showcase page** in the demo renders every variant of every block, so a
broken or ugly variant is caught by looking rather than by discovering it on a client
project. It is marked `noindex`, excluded from the sitemap, and never copied by the CLI.

**Deferred blocks:** team, stats/metrics, gallery, comparison table, newsletter. Not
because they are hard — adding block #9 is a folder plus one registry line. Using eight on
a real client project will teach more about the contract than speculating about fourteen.

## 10. Tooling and pinned versions

| Package | Version |
|---|---|
| pnpm | 11.18 |
| TypeScript | 6.0.3 (explicitly pinned) |
| React | 19.2 |
| TanStack Start | 1.168 |
| Tailwind CSS | 4.3 |
| motion | 12.43 |
| shadcn/ui | components vendored into `src/components/ui` |
| Biome | 2.5 (lint + format; no ESLint, no Prettier) |
| zod | 4.4 |
| react-hook-form | 7.83 |
| Lighthouse CI | latest |

**The TypeScript pin is load-bearing.** npm's `latest` is 7.0.2 — the Go-native compiler
rewrite. Without an exact pin, a fresh install silently lands on 7.x. Major compiler
rewrites are when compiler-API consumers and toolchain plugins lag, so the last
JS-based line is the safer floor for a boilerplate handed to clients. Revisit in roughly
two quarters; it is a one-line change.

## 11. Verification

No unit or end-to-end test frameworks — a deliberate decision. Blocks are simple enough
that unit tests would largely restate their JSX, and the real review of a landing page is
looking at it. What is kept covers only what a human *cannot* see by looking, and adds no
test packages.

1. **`biome ci`** — lint and format, including the import-boundary rule.
2. **`tsc --noEmit`** — this is what enforces locale copy parity and `BlockId` validity.
3. **`scripts/verify-build.mjs`** — plain Node, zero dependencies, run after `pnpm build`.
   Parses every prerendered HTML file and asserts:
   - exactly one `<h1>` per page;
   - canonical present, absolute, and self-referencing;
   - complete `hreflang` set including `x-default`;
   - JSON-LD parses and contains the expected `@type`s;
   - title and description each non-empty and unique across pages;
   - the `hreflang` set is **exactly** `mn`, `en`, `x-default` — nothing missing, nothing stray;
   - exactly one JSON-LD block, which parses, carries the expected `@type`s, and whose every
     `@id` reference resolves to a node actually present in the graph;
   - the JSON-LD `WebPage` agrees with the head on name, description, url and `inLanguage`,
     which is what catches one locale's copy bleeding into the other's graph;
   - the sitemap has one entry per enumerated URL, each carrying the same three `hreflang`
     alternates the head declares — two sources describing the same thing must not diverge;
   - every folder in `src/blocks/` is registered inside the exported registry object, with
     comments stripped first so a `// TODO: register logos` cannot satisfy the check;
   - `src/routes/` contains no unexpected files: pages come only from `pages.config.ts`, so a
     hand-added route would be served while never being prerendered, listed, or verified.

   Unresolvable link targets need no check here — they throw during prerendering (§5).

   These assertions **are** the SEO requirements in executable form. When one fails, the code it
   describes is what changes; weakening an assertion to get a green run removes the only
   automated protection this project has.

   Broken structured data is invisible in a browser and expensive to discover weeks later
   via lost rankings. This script is the highest-value check in the repo.
4. **Two build-config smokes** — build `multi-page + animated + both themes`, and
   `one-page + no animation + light only`. These are build commands, not tests. They prove
   the three boundaries in §7 actually swap, which is the assumption the entire CLI rests
   on.

   Mechanism, since no CLI exists yet: a second config pair checked into
   `configs/smoke-onepage/` (`pages.config.ts` + `site.config.ts`), selected by an env var
   that the Vite config also uses to pick the `motion` and `submit` aliases. One extra
   `package.json` script, no extra dependencies. This same switch is what the CLI later
   automates.
5. **Lighthouse CI budget** — SEO 100, Performance ≥ 95, Accessibility ≥ 95, CLS ≈ 0, enforced
   on both the mobile preset (Lighthouse's throttled default, and the harder of the two) and
   the desktop preset.
   The one added dev tool: an audit tool rather than a test framework, and what makes the
   SEO claim demonstrable to a client.

CI order: `biome ci` → `typecheck` → `build` → `verify-build` → config smokes →
Lighthouse.

## 12. Forward compatibility with the CLI

The CLI is a separate project. This design makes it a file copier plus small codegen
rather than a codemod engine. When built, it will:

1. Ask: navigation (one-page / multi-page), animation, theme mode, token preset, which
   blocks, and which variant per selected block.
2. Copy `src/shell/`, `src/components/ui/`, and only the selected block folders.
3. Generate `pages.config.ts` from the answers, including each block's chosen variant.
4. Choose `motion.ts` vs `motion.noop.ts`, and `submit.server.ts` vs `submit.endpoint.ts`.
5. Copy the selected token preset into `src/styles/`.
6. Write `package.json` from the union of block-declared `requires.npm`, and run
   `shadcn add` for the union of `requires.ui`.

Nothing is deleted and no existing file is edited, so the CLI is coupled to the manifest
*schema*, not to the current contents of any component. Redesigning the header later
requires no CLI change.

## 13. Future projects

1. **Scaffolding CLI** (§12).
2. **Content engine** — MDX articles with their own sitemap, `Article` JSON-LD, RSS, and
   tag pages, per locale. The highest-leverage remaining SEO work and roughly doubles the
   surface area, which is why it is separate.
3. **Analytics** — GA4 or Plausible, Search Console verification, consent handling. Small
   enough to become a CLI flag.
4. **Workspace split** — when the CLI exists, `git mv src/blocks packages/blocks` and add
   `package.json` files.
