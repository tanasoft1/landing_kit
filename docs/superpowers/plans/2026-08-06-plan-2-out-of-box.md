# Plan 2 — Out-of-box Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After `pnpm install && pnpm dev`, the default output is a landing page you would show a client, and a developer who has never seen the repo can understand how to change it.

**Architecture:** Six tasks against the existing single-package kit. Two are token-layer only (no component edits — which is itself the proof the token layer works), two add blocks against the proven contract, one replaces the generated client entry to fix eager bundling, and one builds a `/docs` route generated from live data so it cannot drift.

**Tech Stack:** Unchanged — pnpm 11, TypeScript 6.0.3 (exact pin), React 19.2, TanStack Start 1.168+, Tailwind CSS 4.3, Biome 2.5, zod 4.4, react-hook-form 7.83, Lighthouse CI.

**Spec:** `docs/superpowers/specs/2026-08-06-plan-2-out-of-box-design.md`. Read it before Task 1.

## Global Constraints

Every task's requirements implicitly include this section. These are carried forward from the foundation and remain in force.

- **No test frameworks.** No Vitest, Playwright, or Jest. Verification is `biome ci`, `tsc --noEmit`, `scripts/check-conventions.mjs`, `pnpm build`, `scripts/verify-build.mjs`, Lighthouse CI, and looking at the rendered page.
- **Locales are `mn` and `en`; `mn` is the default and unprefixed.** Both locales, always, for block copy. Parity is a compile error, not a script.
- **Blocks are pure prop-driven components** receiving `{ copy, site, resolve, surface, anchorId, headingLevel }`. No context, no data hooks, no router.
- **Blocks never hardcode a heading tag.** `const H = headingLevel === 1 ? 'h1' : 'h2'`, then `<H>`. `check-conventions.mjs` rejects any literal `<h1>`/`<h2>` in `src/blocks/`, no exceptions.
- **Blocks never write** `py-section`, `px-gutter`, `max-w-*`, `container`, `min-h-screen`, a raw `<section>`, an arbitrary-value escape (`w-[123px]`), or an inline `style`. They compose `<Section>` and `<Container>`. Ordinary component padding (`py-3`) is fine; `min-h-11` is the 44px tap-target floor.
- **Blocks never import `motion` directly** — only `~/motion`. Enforced by Biome, which also blocks the variant files of all three boundaries.
- **No motion preset animates opacity — `FadeIn` and `Reveal` are both transform-only.** `FadeIn` runs on load above the fold; `Reveal` is scroll-triggered for content below it. An `initial={{ opacity: 0 }}` ships `style="opacity:0"` in the prerendered HTML regardless of where the element sits on the page, and `verify-build.mjs` fails the build on it. This kit never ships hidden content, with no exceptions.
- **Prerendered HTML must never hide content** — no `opacity:0`, `visibility:hidden`, `display:none`. `verify-build.mjs` fails the build on any of them.
- **Every `~/x` alias variant pair needs a shared contract type** with a conformance assertion in *both* variants.
- **`BlockSchema` is reserved for markup a block's own content earns** — `FAQPage`, `Product`, `Offer`, `Review`. Page-identity types (`WebPage`, `WebPageElement`, `ContactPage`) are forbidden; the shell already emits exactly one `WebPage`. A block with nothing to say omits `schema` entirely.
- **Mobile-first, Tailwind default breakpoints.** No horizontal overflow at 320px. Verify with a same-origin iframe at fixed CSS width — OS window resizing cannot reach 320px on this machine.
- Lint baseline is **0 warnings** (1 known info about a deprecated `biome.json` field).
- Conventional commit prefixes.

## SEO and performance: what every task must protect

The kit's entire value proposition is technical SEO plus measurable performance. Both are easy to regress invisibly, so these apply to every task that renders anything:

- **`pnpm verify` must pass at 4 pages** after every task. It asserts, per prerendered page: exactly one `<h1>`; `<html lang>` matching the locale; an absolute self-referencing canonical; the exact `hreflang` set `mn`/`en`/`x-default` with correct hrefs; unique non-empty title and description; exactly one JSON-LD block whose every `@id` reference resolves and whose `WebPage` agrees with the head; head/sitemap alternate agreement; `robots.txt` content; and registry/route parity.
- **The prerendered HTML is the product.** Anything that renders correctly in a browser but not in `dist/client/**/index.html` is a failure, not a detail — crawlers see the static file. Check the file, not the browser, whenever the two could differ.
- **LCP and CLS are reported per task, not just at the end.** A regression is far cheaper to attribute to one task than to six.
- **No task may relax a Lighthouse threshold.** If a score falls short, report it.

---

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `src/styles/presets/editorial.css` | Default preset: type-led, restrained colour, air | 1 |
| `src/styles/presets/warm.css` | Second preset: rounder, softer, warmer, denser | 6 |
| `src/styles/presets/aurora.css` | **Deleted** — replaced by the two above | 1 |
| `src/styles/theme.css` | System layer: type scale, `@theme` mappings, base rules | 1 |
| `src/blocks/features/` | The explainer block: `grid` + `alternating` variants | 2 |
| `src/blocks/cta/` | The closer block: `banner` + `split` variants | 3 |
| `src/blocks/registry.ts` | One line per block | 2, 3 |
| `src/config/pages.config.ts` | Page composition | 3 |
| `src/blocks/<id>/variants.ts` | Component map per block — the code behind the split point | 4 |
| `src/blocks/variant-registry.ts` | Synchronous component lookup, populated by whichever entry ran | 4 |
| `src/blocks/variants.all.ts` | Static registration for the server/prerender path only | 4 |
| `src/blocks/block-modules.ts` | Block id → dynamic import of that block's `variants.ts` | 4 |
| `src/shell/types.ts` | `BlockManifest.variants` becomes `variantNames` | 4 |
| `src/shell/blocks/render-blocks.tsx` | Resolves components via `getVariants()` | 4 |
| `src/client.tsx` | Custom client entry: resolve chunks, *then* hydrate | 4 |
| `src/routes/docs.tsx` | The developer surface | 5 |
| `src/routes/debug.tsx` | **Deleted** — folded into `/docs` | 5 |
| `src/shell/docs/token-gallery.tsx` | Swatches and specimens from live CSS | 5 |
| `src/shell/docs/block-gallery.tsx` | Every block × variant, from `registry` | 5 |
| `src/shell/docs/config-reference.tsx` | Config shapes + URL enumeration | 5 |
| `scripts/verify-build.mjs` | Gains `/docs` assertions | 5 |
| `lighthouserc.json` / `.desktop.json` | Budget: mobile ≥ 0.85 hard, desktop ≥ 0.95 hard | 4 |
| `README.md` | Presets, new blocks, `/docs` | 6 |

---

### Task 1: The editorial preset

**Files:**
- Create: `src/styles/presets/editorial.css`
- Delete: `src/styles/presets/aurora.css`
- Modify: `src/styles/theme.css`

**Interfaces:**
- Consumes: the `@theme inline` mapping already in `theme.css`, which maps `--c-*` / `--face-*` / `--width-*` / `--radius` / `--section-y` / `--gutter` onto Tailwind namespaces.
- Produces: the same token names as `aurora.css` did, plus one new one — `--shadow-card` — so a preset can express elevation. Every existing utility (`py-section`, `text-display`, `bg-muted`, …) keeps working untouched.

- [ ] **Step 1: Widen the type scale**

The scale is *system*, not skin, so it lives in `theme.css` and both presets share it. Editorial's "type carries the design" is mostly this change. In `src/styles/theme.css`, replace the four scale values in the static `@theme` block:

```css
@theme {
  --text-display: clamp(2.75rem, 7.5vw, 5.5rem);
  --text-display--line-height: 1.02;
  --text-display--letter-spacing: -0.035em;

  --text-h2: clamp(2rem, 4vw, 3rem);
  --text-h2--line-height: 1.12;
  --text-h2--letter-spacing: -0.025em;

  --text-h3: clamp(1.25rem, 2vw, 1.5rem);
  --text-h3--line-height: 1.3;
  --text-h3--letter-spacing: -0.015em;

  --text-lead: clamp(1.125rem, 1.6vw, 1.375rem);
  --text-lead--line-height: 1.55;
}
```

The display size grows most, the body least — that widening ratio is what reads as editorial rather than merely large.

**The `--line-height` companions are not optional polish.** A font-size token without one inherits Tailwind preflight's ambient `1.5`, which at a 5.5rem display size produces an 8.25rem line box — the hero heading then breaks into two lines separated by nearly a blank line and reads as two disconnected fragments rather than one statement. Leading has to tighten as size grows, which is exactly what a paired scale expresses and a bare font-size cannot.

Letter-spacing moves here too, per step, because display type wants tighter tracking than a subhead does. Tracking Mongolian Cyrillic tighter than about `-0.04em` starts to crowd, so `-0.035em` on display is the floor.

- [ ] **Step 1b: Remove the now-duplicate letter-spacing from the base layer**

`theme.css`'s `@layer base` currently sets `letter-spacing: -0.02em` on `h1, h2, h3`. With the token companions above, that is a second source for the same property — the kind of split this project has repeatedly been bitten by. Delete the `letter-spacing` declaration from that rule, keeping the `font-family`:

```css
  h1, h2, h3 {
    font-family: var(--face-display);
  }
```

Tracking now comes from the scale step alone, which is also more correct: it varies with size instead of applying one value to three very different sizes.

- [ ] **Step 2: Add the shadow token to the `@theme inline` block**

Still in `theme.css`, inside `@theme inline`, add one line beside the existing mappings:

```css
  --shadow-card: var(--elevation-card);
```

This generates a `shadow-card` utility. Editorial sets it to `none`; `warm` (Task 6) sets a real shadow. Without a token here, "soft layered shadows" would have to be a component edit, which would break the claim that presets are token-only.

- [ ] **Step 3: Write the editorial preset**

Create `src/styles/presets/editorial.css`. Note `--elevation-card: none` — editorial separates by tone, not elevation — and that the neutral ramp is nearly hueless while the accent carries all the colour.

```css
:root {
  /* Skin: font pairing. Both families must have Cyrillic coverage. */
  --face-display: 'Manrope Variable', system-ui, sans-serif;
  --face-body: 'Inter Variable', system-ui, sans-serif;

  /* Skin: shape and rhythm. Generous vertical air is most of the look. */
  --radius: 0.5rem;
  --section-y: clamp(5rem, 11vw, 9.5rem);
  --gutter: clamp(1.25rem, 5vw, 2.5rem);
  --width-page: 68rem;
  --width-narrow: 34rem;
  /* `.dark` is applied to <html>, the same element `:root` matches, so a token that does not
     differ between themes is declared once here rather than repeated below. */
  --elevation-card: none;

  /* Skin: light palette. Near-hueless neutrals; one accent does the work. */
  --c-background: oklch(99.2% 0.002 260);
  --c-foreground: oklch(18% 0.008 260);
  --c-muted: oklch(97% 0.003 260);
  --c-muted-foreground: oklch(46% 0.008 260);
  --c-accent: oklch(95.5% 0.004 260);
  --c-border: oklch(90% 0.004 260);
  --c-primary: oklch(52% 0.17 258);
  --c-primary-foreground: oklch(99.2% 0.002 260);
  --c-ring: oklch(52% 0.17 258);
}

.dark {
  /* Authored, not inverted: dark surfaces step up in lightness, chroma stays low. */
  --c-background: oklch(15.5% 0.008 265);
  --c-foreground: oklch(97% 0.003 260);
  --c-muted: oklch(19.5% 0.009 265);
  --c-muted-foreground: oklch(70% 0.01 262);
  --c-accent: oklch(23% 0.011 265);
  --c-border: oklch(27% 0.011 265);
  --c-primary: oklch(74% 0.14 258);
  --c-primary-foreground: oklch(15.5% 0.008 265);
  --c-ring: oklch(74% 0.14 258);
}
```

- [ ] **Step 4: Point `theme.css` at the new preset and delete the old one**

In `src/styles/theme.css`, change the preset import:

```css
@import './presets/editorial.css';
```

Then `rm src/styles/presets/aurora.css`. Confirm nothing else references it:

```bash
grep -rn 'aurora' src/ scripts/ *.json *.ts 2>/dev/null
```

Expected: no matches. If `README.md` mentions it, leave that for Task 6, which rewrites the preset docs.

- [ ] **Step 5: Verify the tokens still generate utilities**

A renamed or mistyped token produces a class that exists in the markup and does nothing — silent and easy to miss.

```bash
pnpm build && grep -c 'py-section\|text-display\|shadow-card' dist/client/assets/*.css
```

Expected: non-zero. Then confirm the values actually changed:

```bash
grep -o 'clamp([^)]*)' dist/client/assets/*.css | head -6
```

Expected: the new `5.5rem` display maximum appears, not the old `4.5rem`.

- [ ] **Step 6: Full gate**

```bash
pnpm verify
```

Expected: `✓ verify-build: 4 page(s) passed`. Nothing about a token change should affect SEO output, so a failure here means something structural broke — investigate rather than proceeding.

- [ ] **Step 7: Look at it, at every width and both themes**

```bash
pnpm dev
```

Use a same-origin iframe at fixed CSS width — OS window resizing cannot reach 320px here. Check **320, 375, 768, 1280, 1536** px, in **light and dark**:

1. No horizontal scrollbar at any width; `scrollWidth === clientWidth`.
2. The hero heading is large enough to read as deliberate, and wraps sensibly in Mongolian (which is longer than the English).
3. Consecutive sections are visibly different tones — the alternating `surface` should now read clearly, where it was too subtle before.
4. Body text contrast is comfortable in both themes.
5. Buttons and links are at least 44px tall.

Record the measured `scrollWidth`/`clientWidth` per width. Save a screenshot at 1280 light and 1280 dark — the controller will look at these.

- [ ] **Step 8: Report Lighthouse, do not act on it yet**

```bash
pnpm lighthouse && pnpm lighthouse:desktop
```

Report Performance, Accessibility, SEO and CLS for both locales on both presets. Accessibility must stay at 1.00 — a contrast regression from the new palette is the likely failure, and if it appears, fix the palette rather than the threshold. Performance will not improve here; Task 4 handles that.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: replace aurora with the editorial preset"
```

---

### Task 2: The `features` block

**Files:**
- Create: `src/blocks/features/copy.mn.ts`, `copy.en.ts`, `features-grid.tsx`, `features-alternating.tsx`, `manifest.ts`
- Modify: `src/blocks/registry.ts`

**Interfaces:**
- Consumes: `BlockProps<C>` = `{ copy, site, resolve, surface, anchorId, headingLevel }` from `~/shell/types`; `<Section id surface className children>`; `<Container width className children>`; `FadeIn`/`Reveal` from `~/motion`.
- Produces: `features` in `registry`, `BlockId` gains `'features'`.

- [ ] **Step 1: Declare the copy type and Mongolian copy**

Create `src/blocks/features/copy.mn.ts`. The type is declared explicitly, never inferred with `typeof mn` — inference makes every field required, and `image` must be optional so `grid` is not forced to supply it.

```ts
export type FeatureItem = {
  title: string
  body: string
  /** `alternating` variant only. */
  image?: { src: string; alt: string; width: number; height: number }
}

export type FeaturesCopy = {
  navLabel: string
  heading: string
  lead: string
  items: FeatureItem[]
}

export const mn: FeaturesCopy = {
  navLabel: 'Боломжууд',
  heading: 'Хэрэглэгчээ татах бүх зүйл',
  lead: 'Хурдан ачаалагддаг, хайлтад оновчлогдсон, хоёр хэлээр ажилладаг вэб хуудас.',
  items: [
    {
      title: 'Хайлтад оновчлогдсон',
      body: 'Мета өгөгдөл, sitemap, бүтэцлэгдсэн өгөгдөл автоматаар үүснэ. Google эхний хуудсанд гарах суурь бэлэн.',
    },
    {
      title: 'Хоёр хэл',
      body: 'Монгол, англи хэл дээр зэрэг ажиллана. Хэл солих товч, зөв hreflang шошго бүгд бэлэн.',
    },
    {
      title: 'Хурдан',
      body: 'Бүх хуудас урьдчилан үүсгэгддэг тул сервер шаардлагагүй, ачаалалт шууд.',
    },
  ],
}
```

- [ ] **Step 2: Write the English copy against that type**

Create `src/blocks/features/copy.en.ts`:

```ts
import type { FeaturesCopy } from './copy.mn'

export const en: FeaturesCopy = {
  navLabel: 'Features',
  heading: 'Everything you need to convert',
  lead: 'A fast, search-optimised landing page that works in two languages out of the box.',
  items: [
    {
      title: 'Built for search',
      body: 'Metadata, sitemap and structured data are generated from your config. The technical groundwork for ranking is already done.',
    },
    {
      title: 'Bilingual',
      body: 'Mongolian and English side by side, with a locale switcher and correct hreflang tags throughout.',
    },
    {
      title: 'Fast',
      body: 'Every page is prerendered to static HTML, so there is no server to wait for and nothing to cold-start.',
    },
  ],
}
```

- [ ] **Step 3: Prove locale parity is enforced**

Temporarily delete the `lead` line from `copy.en.ts`, then:

```bash
pnpm typecheck
```

Expected: FAIL, naming `lead` missing from type `FeaturesCopy`. Restore and re-run — expected: exit 0. This replaces a test suite; confirm the mechanism works for this block rather than assuming it carries over.

- [ ] **Step 4: Write the `grid` variant**

Create `src/blocks/features/features-grid.tsx`. Note `<H>` from `headingLevel`, `surface` and `anchorId` from props, and `Reveal` — this block sits below the fold, so opacity animation is permitted here where it would not be in the hero.

```tsx
import { Reveal } from '~/motion'
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'
import type { BlockProps } from '~/shell/types'
import type { FeaturesCopy } from './copy.mn'

export function FeaturesGrid({ copy, surface, anchorId, headingLevel }: BlockProps<FeaturesCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <div className="max-w-2xl">
          <H className="text-h2 font-semibold text-balance">{copy.heading}</H>
          <p className="text-muted-foreground text-lead mt-4 text-pretty">{copy.lead}</p>
        </div>
        <Reveal className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {copy.items.map((item) => (
            <div key={item.title}>
              <h3 className="text-h3 font-semibold">{item.title}</h3>
              <p className="text-muted-foreground mt-2 text-pretty">{item.body}</p>
            </div>
          ))}
        </Reveal>
      </Container>
    </Section>
  )
}
```

**Do not use `max-w-2xl`** — `check-conventions.mjs` rejects `max-w-*` in blocks, because page measure belongs to `<Container>`. And do not nest one `<Container>` inside another: each applies `px-gutter`, so nesting indents the inner content by a second gutter.

Instead, `<Container>` gains an alignment prop, and the intro becomes a **sibling** of the grid rather than a child:

```tsx
// src/shell/layout/container.tsx
const WIDTH = { page: 'max-w-page', narrow: 'max-w-narrow' } as const
const ALIGN = { center: 'mx-auto', start: 'mr-auto' } as const

export function Container({
  width = 'page',
  align = 'center',
  className = '',
  children,
}: {
  width?: keyof typeof WIDTH
  align?: keyof typeof ALIGN
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`w-full px-gutter ${ALIGN[align]} ${WIDTH[width]} ${className}`}>
      {children}
    </div>
  )
}
```

`align` is a prop rather than a `className` override because `mx-auto` and `ml-0` are both margin utilities whose precedence depends on Tailwind's internal ordering, not on the order you write them — a coin-flip that would work until it silently didn't.

The block then uses two sibling containers, so both share a left edge:

```tsx
<Section id={anchorId} surface={surface}>
  <Container width="narrow" align="start">
    <H className="text-h2 font-semibold text-balance">{copy.heading}</H>
    <p className="text-muted-foreground text-lead mt-4 text-pretty">{copy.lead}</p>
  </Container>
  <Container className="mt-14">
    {/* the grid */}
  </Container>
</Section>
```

A narrow intro is worth keeping rather than letting the lead run the full 68rem — that would be roughly 110 characters a line, well past comfortable reading. The point is a narrow *measure*, not a centred box.

- [ ] **Step 5: Write the `alternating` variant**

Create `src/blocks/features/features-alternating.tsx`. Images carry explicit dimensions and lazy loading — this is below the fold, so eager loading would compete with the LCP element.

```tsx
import { Reveal } from '~/motion'
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'
import type { BlockProps } from '~/shell/types'
import type { FeaturesCopy } from './copy.mn'

export function FeaturesAlternating({
  copy,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<FeaturesCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <H className="text-h2 font-semibold text-balance">{copy.heading}</H>
        <p className="text-muted-foreground text-lead mt-4 text-pretty">{copy.lead}</p>

        <div className="mt-16 grid gap-16">
          {copy.items.map((item, i) => (
            <Reveal
              key={item.title}
              className="grid items-center gap-8 md:grid-cols-2"
            >
              <div className={i % 2 === 1 ? 'md:order-2' : undefined}>
                <h3 className="text-h3 font-semibold">{item.title}</h3>
                <p className="text-muted-foreground mt-3 text-pretty">{item.body}</p>
              </div>
              {item.image ? (
                <img
                  src={item.image.src}
                  alt={item.image.alt}
                  width={item.image.width}
                  height={item.image.height}
                  loading="lazy"
                  className="rounded-base w-full h-auto"
                />
              ) : (
                <div className="bg-muted rounded-base aspect-[4/3] w-full" aria-hidden="true" />
              )}
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  )
}
```

The `else` branch renders a plain tinted box when no image is supplied, so the variant is usable without assets and the layout does not collapse. It is `aria-hidden` because it carries no information.

- [ ] **Step 6: Write the manifest and register the block**

Create `src/blocks/features/manifest.ts`. No `schema` — a feature list earns no rich result, and page-identity types are forbidden.

```ts
import type { BlockManifest } from '~/shell/types'
import { en } from './copy.en'
import { type FeaturesCopy, mn } from './copy.mn'
import { FeaturesAlternating } from './features-alternating'
import { FeaturesGrid } from './features-grid'

export const features = {
  id: 'features',
  variants: { grid: FeaturesGrid, alternating: FeaturesAlternating },
  defaultVariant: 'grid',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<FeaturesCopy, 'grid' | 'alternating'>
```

In `src/blocks/registry.ts`, import `features` and add it to **both** the `manifests` object and the exported `registry` object — the second is a separately-written literal that `verify-build.mjs` greps, and the `Record<BlockId, …>` annotation makes a mismatch a compile error.

- [ ] **Step 7: Convention and type gates**

```bash
pnpm conventions && pnpm typecheck && pnpm lint
```

Fix what the checker reports — including the `max-w-2xl` from Step 4. The rule exists to keep page measure owned by `<Container>`; satisfy it rather than editing the rule.

- [ ] **Step 8: Render it and look**

Temporarily add `'features'` to the home page's `blocks` array in `src/config/pages.config.ts` so you can see it (Task 3 sets the final composition):

```bash
pnpm dev
```

At 320/375/768/1280/1536, both themes:
1. `grid` is one column on mobile, two at `sm`, three at `lg`.
2. `alternating` stacks to one column below `md`, and alternates image side above it.
3. No horizontal overflow; report `scrollWidth`/`clientWidth`.
4. The heading renders as `<h2>`, since hero is first. Confirm in the DOM, not by assumption.

- [ ] **Step 9: SEO gate**

```bash
pnpm build && node scripts/verify-build.mjs
```

Expected: 4 pages pass. Specifically confirm the home page still has **exactly one `<h1>`** — adding a block whose heading is an `<h2>` must not change that, and this is the assertion most likely to catch a `headingLevel` mistake.

- [ ] **Step 10: Report Lighthouse**

```bash
pnpm lighthouse && pnpm lighthouse:desktop
```

Report all four scores per locale per preset, plus LCP and CLS. Performance may drop — this block adds JavaScript to an eager bundle, which is exactly the problem Task 4 fixes. Report the number; do not change any threshold.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add features block with grid and alternating variants"
```

---

### Task 3: The `cta` block and the default page composition

**Files:**
- Create: `src/blocks/cta/copy.mn.ts`, `copy.en.ts`, `cta-banner.tsx`, `cta-split.tsx`, `manifest.ts`
- Modify: `src/blocks/registry.ts`, `src/config/pages.config.ts`, `configs/smoke-onepage/pages.config.ts`

**Interfaces:**
- Consumes: the same `BlockProps` contract as Task 2; `resolve(target)` from props.
- Produces: `cta` in `registry`; home page composition becomes `hero → features → cta`.

- [ ] **Step 1: Write the copy**

Create `src/blocks/cta/copy.mn.ts`:

```ts
export type CtaCopy = {
  heading: string
  lead: string
  primaryCta: { label: string; target: string }
  /** `split` variant shows this alongside the primary; `banner` omits it. */
  secondaryCta?: { label: string; target: string }
}

export const mn: CtaCopy = {
  heading: 'Төслөө эхлүүлэх үү?',
  lead: 'Хүсэлтээ илгээгээрэй, бид ажлын нэг өдөрт хариу барина.',
  primaryCta: { label: 'Холбоо барих', target: 'contact' },
  secondaryCta: { label: 'Боломжууд', target: 'features' },
}
```

Create `src/blocks/cta/copy.en.ts`:

```ts
import type { CtaCopy } from './copy.mn'

export const en: CtaCopy = {
  heading: 'Ready to start?',
  lead: 'Send us a message and we will reply within one business day.',
  primaryCta: { label: 'Get in touch', target: 'contact' },
  secondaryCta: { label: 'See features', target: 'features' },
}
```

There is no `navLabel` and no `nav` entry in the manifest — a closing CTA does not belong in the header.

- [ ] **Step 2: Write the `banner` variant**

Create `src/blocks/cta/cta-banner.tsx`. Both CTA targets go through `resolve()`, which is what makes the same copy produce `/contact` in multi-page mode and `#contact` in one-page mode.

```tsx
import { Reveal } from '~/motion'
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'
import type { BlockProps } from '~/shell/types'
import type { CtaCopy } from './copy.mn'

export function CtaBanner({
  copy,
  resolve,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<CtaCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container width="narrow" className="text-center">
        <Reveal>
          <H className="text-h2 font-semibold text-balance">{copy.heading}</H>
          <p className="text-muted-foreground text-lead mt-4 text-pretty">{copy.lead}</p>
          <a
            href={resolve(copy.primaryCta.target)}
            className="bg-primary text-primary-foreground rounded-base mt-8 inline-flex min-h-11 items-center px-7 py-3 font-medium"
          >
            {copy.primaryCta.label}
          </a>
        </Reveal>
      </Container>
    </Section>
  )
}
```

- [ ] **Step 3: Write the `split` variant**

Create `src/blocks/cta/cta-split.tsx`:

```tsx
import { Reveal } from '~/motion'
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'
import type { BlockProps } from '~/shell/types'
import type { CtaCopy } from './copy.mn'

export function CtaSplit({ copy, resolve, surface, anchorId, headingLevel }: BlockProps<CtaCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <Reveal className="grid items-center gap-8 md:grid-cols-2">
          <div>
            <H className="text-h2 font-semibold text-balance">{copy.heading}</H>
            <p className="text-muted-foreground text-lead mt-4 text-pretty">{copy.lead}</p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <a
              href={resolve(copy.primaryCta.target)}
              className="bg-primary text-primary-foreground rounded-base inline-flex min-h-11 items-center px-7 py-3 font-medium"
            >
              {copy.primaryCta.label}
            </a>
            {copy.secondaryCta ? (
              <a
                href={resolve(copy.secondaryCta.target)}
                className="border-border rounded-base inline-flex min-h-11 items-center border px-7 py-3 font-medium"
              >
                {copy.secondaryCta.label}
              </a>
            ) : null}
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
```

- [ ] **Step 4: Manifest and registry**

Create `src/blocks/cta/manifest.ts`:

```ts
import type { BlockManifest } from '~/shell/types'
import { CtaBanner } from './cta-banner'
import { CtaSplit } from './cta-split'
import { en } from './copy.en'
import { type CtaCopy, mn } from './copy.mn'

export const cta = {
  id: 'cta',
  variants: { banner: CtaBanner, split: CtaSplit },
  defaultVariant: 'banner',
  copy: { mn, en },
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<CtaCopy, 'banner' | 'split'>
```

Register it in both objects in `src/blocks/registry.ts`, as in Task 2.

- [ ] **Step 5: Set the default page composition**

In `src/config/pages.config.ts`, the home page's blocks become:

```ts
blocks: ['hero', 'features', 'cta'],
```

Leave the `/contact` page as `['contact']`. In `configs/smoke-onepage/pages.config.ts`, the single page becomes:

```ts
blocks: [{ id: 'hero', variant: 'split' }, 'features', 'cta', 'contact'],
```

- [ ] **Step 6: Verify the link resolver in both modes — this is the architectural claim**

The same `cta` copy targets `'contact'` in both configs. In multi-page mode `contact` is a page, so it must resolve to `/contact`. In one-page mode `contact` is a block on the current page, so it must resolve to `#contact`. Same component, same copy, different config.

```bash
pnpm dev
```

On `/`, inspect the CTA's `href` — expected `/contact`. On `/en`, expected `/en/contact`. Then:

```bash
KIT_CONFIG=onepage pnpm dev
```

On `/`, expected `#contact`, and clicking it scrolls to the contact form. Report all three.

- [ ] **Step 7: Both smoke configs**

```bash
pnpm smoke:full && pnpm smoke:onepage
```

Expected: 4 pages and 2 pages respectively. The one-page config must still require **zero** component changes.

- [ ] **Step 8: SEO gate, with attention to headings**

```bash
pnpm build && node scripts/verify-build.mjs
```

Expected: 4 pages pass. The one-page config now stacks four blocks on one page — confirm it still has exactly one `<h1>` (hero's, since it is first) and that `features`, `cta` and `contact` all render `<h2>`:

```bash
KIT_CONFIG=onepage pnpm build && node scripts/verify-build.mjs
python3 -c "
import re
h=open('dist/client/index.html',encoding='utf8').read()
print('h1:', len(re.findall(r'<h1[\s>]',h)), ' h2:', len(re.findall(r'<h2[\s>]',h)))
"
```

Expected: `h1: 1  h2: 3`.

- [ ] **Step 9: Report Lighthouse**

```bash
pnpm build && pnpm lighthouse && pnpm lighthouse:desktop
```

Report all scores plus LCP and CLS. This is the low-water mark for performance — two blocks have now been added to the eager bundle and nothing has been done about it yet. Task 4 is next precisely because of this number.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add cta block and set the default page composition"
```

---

### Task 4: Pre-hydration block imports

**Files:**
- Create: `src/blocks/block-modules.ts`, `src/client.tsx`
- Modify: `src/blocks/registry.ts`, `lighthouserc.json`, `lighthouserc.desktop.json`

**Interfaces:**
- Consumes: `registry`, `BlockId`, `pages` from `~/config/pages.config`.
- Produces: `blockModules: Record<BlockId, () => Promise<unknown>>`; a custom client entry that awaits the current page's block modules before calling `hydrateRoot`.

**Read this before starting.** `React.lazy` was already tried for this and reverted: a lazy component suspends on its **first render during hydration**, so React discards the server-rendered subtree and re-renders when the chunk arrives. Performance fell 0.90 → 0.82 and CLS rose 0.000 → 0.169 mobile / 0.078 desktop. A `modulepreload` changed CLS by exactly zero, proving hydration-discard rather than network timing. Full detail in `docs/superpowers/known-limitations.md`.

The approach here is different in one specific way: the imports resolve **before** `hydrateRoot` is called, so no Suspense boundary ever exists during the hydration pass and no subtree is discarded. Manifests stay eagerly imported — copy, nav labels and schema are needed synchronously by the SEO layer.

- [ ] **Step 1: Create the module map**

Create `src/blocks/block-modules.ts`. This is the only place a block's component module is referenced dynamically, and it is what gives Vite its split points.

```ts
import type { BlockId } from './registry'

/**
 * Dynamic import per block, keyed by id. Vite creates one chunk per entry here.
 *
 * Deliberately separate from `registry.ts`: the registry imports manifests eagerly, because
 * copy, nav labels and schema are needed synchronously to build the head, the JSON-LD graph
 * and the nav. Only the component modules are deferred, and that is where the weight is —
 * `contact` alone is 99 KB raw / 30 KB gzip of react-hook-form and zod.
 */
export const blockModules: Record<BlockId, () => Promise<unknown>> = {
  hero: () => import('./hero/manifest'),
  features: () => import('./features/manifest'),
  cta: () => import('./cta/manifest'),
  contact: () => import('./contact/manifest'),
}
```

- [ ] **Step 2: Create the custom client entry**

Create `src/client.tsx`. This replaces TanStack Start's generated client entry, which is a supported override.

```tsx
import { StartClient } from '@tanstack/react-start/client'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { blockModules } from '~/blocks/block-modules'
import type { BlockId } from '~/blocks/registry'
import { pages } from '~/config/pages.config'
import { site } from '~/config/site.config'
import { getRouter } from '~/router'
import { resolveRequest } from '~/shell/pages/resolve-request'

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

  const router = getRouter()
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient router={router} />
      </StrictMode>,
    )
  })
}

void hydrate()
```

If the installed version's client-entry contract differs — a different export shape, or `hydrateRoot` targeting an element rather than `document` — adapt to it, but keep the `await` before hydration. That ordering is the entire point. Report what shape the installed version required.

- [ ] **Step 3: Break the static chain from the registry to the components**

**This is the crux of the task, and doing it wrong produces a passing build with an unchanged bundle.**

Today `manifest.ts` statically imports its components, and `registry.ts` statically imports every manifest. So `registry → manifests → components` is an unbroken static chain, and every component is reachable from the entry. Dynamic imports of the *same* modules split nothing: Vite sees them already reachable and keeps them in the main chunk. The chain has to actually be cut.

Split each block's manifest in two — metadata stays eager because the SEO layer needs it synchronously; components move behind the split point.

**a.** Create `src/blocks/<id>/variants.ts` per block, holding only the component map:

```ts
// src/blocks/hero/variants.ts
import { HeroCentered } from './hero-centered'
import { HeroSplit } from './hero-split'

export const variants = { centered: HeroCentered, split: HeroSplit }
```

**b.** Change each `manifest.ts` to drop its component imports and declare variant *names* instead:

```ts
// src/blocks/hero/manifest.ts — no component import anywhere
export const hero = {
  id: 'hero',
  variantNames: ['centered', 'split'] as const,
  defaultVariant: 'centered',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<HeroCopy, 'centered' | 'split'>
```

Update `BlockManifest` in `src/shell/types.ts` accordingly: `variants` becomes `variantNames: readonly V[]`. Keep `defaultVariant: V` — with `as const` on the names array, a `defaultVariant` not in the list stays a compile error.

**c.** Create `src/blocks/variant-registry.ts`, the synchronous lookup `RenderBlocks` reads:

```ts
import type { ComponentType } from 'react'
import type { BlockProps } from '~/shell/types'
import type { BlockId } from './registry'

// biome-ignore lint/suspicious/noExplicitAny: one map holds every block's differently-typed copy.
type VariantMap = Record<string, ComponentType<BlockProps<any>>>

const loaded = new Map<BlockId, VariantMap>()

export function registerVariants(id: BlockId, variants: VariantMap) {
  loaded.set(id, variants)
}

export function getVariants(id: BlockId): VariantMap {
  const v = loaded.get(id)
  if (!v) {
    // Reaching here means a block rendered before its module was loaded — a wiring bug, not a
    // user-facing condition. Failing loudly beats rendering an empty section.
    throw new Error(
      `Variants for block '${id}' were never registered. The entry point must load and register a block's module before rendering it.`,
    )
  }
  return v
}
```

**d.** `src/blocks/block-modules.ts` points at the new `variants.ts` files, and registers on load:

```ts
hero: () => import('./hero/variants').then((m) => registerVariants('hero', m.variants)),
```

**e.** `RenderBlocks` resolves the component via `getVariants(id)[variantName]` instead of `manifest.variants[...]`, keeping its existing unknown-variant error.

**f.** The server still needs every component synchronously at prerender. Create `src/blocks/variants.all.ts` that statically imports and registers all four, and import it from the **server** side only — the module must be unreachable from `src/client.tsx`, or the split is undone.

TanStack Start's server entry override is `src/server.ts`; verify the installed version's contract before relying on it. **If the server entry cannot be hooked**, the fallback is to have `block-modules.ts` do `if (import.meta.env.SSR) { … }` with a static registration path, since Vite eliminates the false branch from the client build. Report which mechanism the installed version required.

Verify the split actually happened before proceeding:

```bash
pnpm build
ls -S dist/client/assets/*.js | head -6 | while read f; do printf '%8d  %s\n' $(wc -c < "$f") "$(basename $f)"; done
grep -l 'react-hook-form\|useForm' dist/client/assets/*.js
python3 -c "
import re
h=open('dist/client/index.html',encoding='utf8').read()
print('home page scripts:', [re.sub(r'.*/','',m) for m in re.findall(r'/assets/[^\"]+\.js', h)])
"
```

Expected: more than one substantial chunk; the chunk containing `react-hook-form` is **not** in the home page's script list. If the bundle is still monolithic, the import chain is still eager — find what is pulling components into the main chunk and report it rather than proceeding to Lighthouse.

- [ ] **Step 4: The SEO gate that matters most here**

A lazy-loading change that empties the prerendered HTML would look perfect in a browser after hydration while serving crawlers a shell. Check the static files directly:

```bash
LC_ALL=C grep -c 'Бизнесээ онлайнаар хөгжүүл' dist/client/index.html
LC_ALL=C grep -c 'Бидэнтэй холбогдоно уу' dist/client/contact/index.html
node scripts/verify-build.mjs
```

Expected: `1`, `1`, and 4 pages pass. Use `LC_ALL=C grep` — the default grep on this machine has false-negatived on Cyrillic single-line files before. If either count is 0, **stop and report**; do not attempt a workaround.

- [ ] **Step 5: CLS is the regression to watch**

```bash
pnpm lighthouse && pnpm lighthouse:desktop
```

Report Performance, CLS and LCP for both locales on both presets.

**CLS must stay at 0.** That is the metric the previous attempt broke, and a rise means content is being discarded and re-rendered during hydration — the exact failure this design avoids. If CLS is non-zero, report it with the number; the approach is wrong and needs rethinking, not patching.

- [ ] **Step 6: Set the budget, now that the numbers are known**

Only now, with real measurements in hand. In `lighthouserc.json`, remove the `_comment` block explaining the `warn`, and set:

```json
"categories:performance": ["error", { "minScore": 0.85 }],
```

`lighthouserc.desktop.json` keeps `["error", { "minScore": 0.95 }]`. Every assertion on both presets is now a hard failure — nothing is soft.

Then run both chained, which is the regression test for the artifact-clearing fix:

```bash
pnpm lighthouse && pnpm lighthouse:desktop
```

Expected: both exit 0. If mobile is below 0.85, report it rather than lowering the bar.

- [ ] **Step 7: Both smoke configs still work**

```bash
pnpm verify && pnpm smoke:full && pnpm smoke:onepage
```

The one-page config renders four blocks on one page, so its module set differs from the home page's — a good check that `blocksForCurrentUrl` is reading config rather than assuming.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "perf: resolve block chunks before hydration, set the final budget"
```

---

### Task 5: `/docs`, the living developer surface

**Files:**
- Create: `src/routes/docs.tsx`, `src/shell/docs/token-gallery.tsx`, `src/shell/docs/block-gallery.tsx`, `src/shell/docs/config-reference.tsx`
- Delete: `src/routes/debug.tsx`
- Modify: `scripts/verify-build.mjs`, `src/shell/seo/emit-plugin.ts`

**Interfaces:**
- Consumes: `registry`, `BlockId`; `pages`, `site`; `enumerateUrls` from `~/shell/pages/enumerate`.
- Produces: a `/docs` route, English-only, excluded from prerendering, the sitemap and indexing.

- [ ] **Step 1: The token gallery**

Create `src/shell/docs/token-gallery.tsx`. Every value is read from live CSS, so it cannot disagree with the preset.

```tsx
const COLOR_TOKENS = [
  'background',
  'foreground',
  'muted',
  'muted-foreground',
  'accent',
  'border',
  'primary',
  'primary-foreground',
  'ring',
] as const

const TYPE_TOKENS = ['display', 'h2', 'h3', 'lead'] as const

export function TokenGallery() {
  return (
    <div className="grid gap-10">
      <div>
        <h3 className="text-h3 font-semibold">Colour</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Rendered from the live CSS variables. Toggle the theme to see the dark palette.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COLOR_TOKENS.map((t) => (
            <div key={t} className="border-border rounded-base border p-3">
              <div className={`bg-${t} border-border h-12 w-full rounded border`} />
              <code className="mt-2 block text-xs">--color-{t}</code>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-h3 font-semibold">Type scale</h3>
        <div className="mt-4 grid gap-4">
          {TYPE_TOKENS.map((t) => (
            <div key={t} className="border-border border-b pb-3">
              <code className="text-muted-foreground text-xs">text-{t}</code>
              <p className={`text-${t} mt-1`}>Сайн байна уу — The quick brown fox</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

`bg-${t}` and `text-${t}` are dynamic class names, which Tailwind cannot see when scanning source — the utilities would not be generated. Add a `@source inline(...)` directive in `theme.css` listing them, or write the class names literally in a lookup object. Resolve this in Step 6 when the swatches render blank; the failure is visible, not silent.

- [ ] **Step 2: The block gallery**

Create `src/shell/docs/block-gallery.tsx`. It iterates `registry`, so a new block appears here with no edit.

```tsx
import { registry } from '~/blocks/registry'
import type { BlockId } from '~/blocks/registry'
import { site } from '~/config/site.config'

export function BlockGallery() {
  const ids = Object.keys(registry) as BlockId[]
  return (
    <div className="grid gap-16">
      {ids.map((id) => {
        const manifest = registry[id]
        const variantNames = Object.keys(manifest.variants)
        return (
          <div key={id}>
            <h3 className="text-h3 font-semibold">
              {id}{' '}
              <span className="text-muted-foreground text-sm font-normal">
                {variantNames.length} variant{variantNames.length === 1 ? '' : 's'} · default:{' '}
                {manifest.defaultVariant}
              </span>
            </h3>
            <div className="mt-4 grid gap-8">
              {variantNames.map((v) => {
                const Component = manifest.variants[v]
                return (
                  <div key={v} className="border-border overflow-hidden rounded-base border">
                    <div className="border-border bg-muted border-b px-4 py-2">
                      <code className="text-xs">{`{ id: '${id}', variant: '${v}' }`}</code>
                    </div>
                    <Component
                      copy={manifest.copy.en}
                      site={site}
                      resolve={(t: string) => `#${t}`}
                      surface="default"
                      anchorId={`docs-${id}-${v}`}
                      headingLevel={2}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

The `resolve` stub returns `#target` because this page is a gallery, not a real page — nothing here should navigate. `headingLevel={2}` for every preview, so the docs page keeps exactly one `<h1>` of its own.

- [ ] **Step 3: The config reference**

Create `src/shell/docs/config-reference.tsx`, absorbing what `/debug` did:

```tsx
import { pages } from '~/config/pages.config'
import { site } from '~/config/site.config'
import { enumerateUrls } from '~/shell/pages/enumerate'

export function ConfigReference() {
  const urls = enumerateUrls(pages, site)
  return (
    <div className="grid gap-8">
      <div>
        <h3 className="text-h3 font-semibold">Pages this config produces</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Every prerendered URL, derived from pages.config.ts × site.locales.
        </p>
        <ul className="mt-3 grid gap-1">
          {urls.map((u) => (
            <li key={u.path}>
              <code className="text-sm">{u.path}</code>
              <span className="text-muted-foreground text-sm"> — {u.pageId} / {u.locale}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-h3 font-semibold">pages.config.ts</h3>
        <pre className="bg-muted rounded-base mt-3 overflow-x-auto p-4 text-xs">
          {JSON.stringify(pages, null, 2)}
        </pre>
      </div>

      <div>
        <h3 className="text-h3 font-semibold">site.config.ts</h3>
        <pre className="bg-muted rounded-base mt-3 overflow-x-auto p-4 text-xs">
          {JSON.stringify(site, null, 2)}
        </pre>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: The route**

Create `src/routes/docs.tsx`. The `noindex` meta tag matters: `robots.txt` prevents *crawling*, not *indexing* — a URL linked from elsewhere can still be indexed without being fetched, and `noindex` is what actually prevents that.

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { BlockGallery } from '~/shell/docs/block-gallery'
import { ConfigReference } from '~/shell/docs/config-reference'
import { TokenGallery } from '~/shell/docs/token-gallery'
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'

export const Route = createFileRoute('/docs')({
  head: () => ({
    meta: [
      { title: 'Landing Kit — developer docs' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: DocsPage,
})

function DocsPage() {
  return (
    <main>
      <Section>
        <Container>
          <h1 className="text-h2 font-semibold">Developer docs</h1>
          <p className="text-muted-foreground text-lead mt-3">
            Generated from the live registry and CSS, so it cannot drift from the code. English
            only — this page is for developers, not visitors, and it is excluded from
            prerendering, the sitemap and indexing.
          </p>
        </Container>
      </Section>

      <Section surface="muted">
        <Container>
          <h2 className="text-h2 font-semibold">Tokens</h2>
          <div className="mt-8">
            <TokenGallery />
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <h2 className="text-h2 font-semibold">Blocks</h2>
          <div className="mt-8">
            <BlockGallery />
          </div>
        </Container>
      </Section>

      <Section surface="muted">
        <Container>
          <h2 className="text-h2 font-semibold">Config</h2>
          <div className="mt-8">
            <ConfigReference />
          </div>
        </Container>
      </Section>
    </main>
  )
}
```

- [ ] **Step 5: Delete `/debug` and update the checks that name it**

```bash
rm src/routes/debug.tsx
```

In `scripts/verify-build.mjs`:
- `ALLOWED_ROUTE_FILES` — replace `'debug.tsx'` with `'docs.tsx'`.
- The prerender-exclusion check — change `debug/index.html` to `docs/index.html`, and the message accordingly.

In `src/shell/seo/emit-plugin.ts`, change the `robots.txt` line from `Disallow: /debug` to `Disallow: /docs`.

Confirm nothing still references the old route:

```bash
grep -rn 'debug' src/ scripts/ README.md 2>/dev/null
```

Expected: no matches, or only unrelated prose.

- [ ] **Step 6: Make it render, then look at it**

```bash
pnpm dev
```

Open `/docs`. Expected: colour swatches show actual colours (if blank, that is the dynamic-class problem from Step 1 — fix it now), type specimens show the real scale with both Cyrillic and Latin, every block appears with every variant, and the config sections list 4 URLs.

Toggle the theme and confirm the swatches change — that is the proof they read live CSS rather than baked values.

Check 375 and 1280 for horizontal overflow; the `<pre>` config blocks are the likely offender and already have `overflow-x-auto`.

- [ ] **Step 7: Confirm `/docs` is genuinely excluded**

```bash
pnpm build && node scripts/verify-build.mjs
ls dist/client/docs 2>&1 | head -1
grep -c 'docs' dist/client/sitemap.xml
cat dist/client/robots.txt
```

Expected: 4 pages pass; `dist/client/docs` does not exist; `0` occurrences in the sitemap; `robots.txt` contains `Disallow: /docs`. All four matter — the route must be invisible to crawlers by three independent mechanisms.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add /docs living developer surface, replacing /debug"
```

---

### Task 6: The `warm` preset and the README

**Files:**
- Create: `src/styles/presets/warm.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: the token contract established in Task 1, including `--elevation-card`.
- Produces: a second preset selectable by changing one `@import` in `theme.css`.

- [ ] **Step 1: Write the warm preset**

Create `src/styles/presets/warm.css`. It must differ in **radius, shadow, colour temperature and density** — not merely hue. That is what makes swapping presets a demonstration rather than a recolour.

```css
:root {
  --face-display: 'Manrope Variable', system-ui, sans-serif;
  --face-body: 'Inter Variable', system-ui, sans-serif;

  /* Rounder, tighter, softer than editorial. */
  --radius: 1rem;
  --section-y: clamp(3.5rem, 8vw, 6.5rem);
  --gutter: clamp(1rem, 4vw, 2rem);
  --width-page: 74rem;
  --width-narrow: 36rem;
  --elevation-card: 0 1px 2px oklch(30% 0.02 70 / 0.06), 0 8px 24px oklch(30% 0.02 70 / 0.08);

  /* Warm neutrals — hue pulled toward amber, chroma raised. */
  --c-background: oklch(99% 0.006 85);
  --c-foreground: oklch(24% 0.02 60);
  --c-muted: oklch(96.5% 0.012 80);
  --c-muted-foreground: oklch(50% 0.022 60);
  --c-accent: oklch(94% 0.02 75);
  --c-border: oklch(89% 0.016 75);
  --c-primary: oklch(60% 0.16 40);
  --c-primary-foreground: oklch(99% 0.006 85);
  --c-ring: oklch(60% 0.16 40);
}

.dark {
  --c-background: oklch(19% 0.014 55);
  --c-foreground: oklch(96% 0.008 80);
  --c-muted: oklch(23.5% 0.016 55);
  --c-muted-foreground: oklch(74% 0.016 70);
  --c-accent: oklch(28% 0.02 55);
  --c-border: oklch(32% 0.02 55);
  --c-primary: oklch(76% 0.13 45);
  --c-primary-foreground: oklch(19% 0.014 55);
  --c-ring: oklch(76% 0.13 45);
}
```

- [ ] **Step 2: Verify it swaps cleanly, then verify accessibility**

Temporarily change the import in `src/styles/theme.css` to `@import './presets/warm.css';`, then:

```bash
pnpm dev
```

Confirm on `/` and `/docs`, at 375 and 1280, in **both themes**: corners are visibly rounder, cards carry a soft shadow where editorial had none, the palette reads warm, and sections are tighter vertically. It should look like a different design, not a hue rotation.

Then the gate that actually matters:

```bash
pnpm build && pnpm lighthouse && pnpm lighthouse:desktop
```

**Accessibility must be 1.00 on both locales and both presets.** Warm palettes with raised chroma are exactly where contrast fails. If it drops, fix the palette — darken `--c-muted-foreground`, usually — and never the threshold. Report the scores for warm as well as editorial.

Restore `theme.css` to `editorial.css` when done, and confirm `git diff src/styles/theme.css` is empty.

- [ ] **Step 3: Update the README**

Rewrite the *Reskinning: the token surface* section to describe both presets by name and personality, and how to swap (`@import` in `theme.css`). Remove every mention of `aurora`. Add `features` and `cta` to any block listing. Replace references to `/debug` with `/docs`, and describe what `/docs` contains and that it is excluded from prerendering, the sitemap and indexing.

In the *Lighthouse budget* section, replace the whole "Current status, and one known gap" subsection with the measured Plan 2 numbers, and state that both presets now assert as hard failures — mobile ≥ 0.85, desktop ≥ 0.95.

- [ ] **Step 4: Update the known-limitations doc**

In `docs/superpowers/known-limitations.md`, the open performance issue is now resolved or changed. Rewrite that section with the post-Task-4 numbers. Keep the `React.lazy` account — it explains why the current approach is shaped as it is. Move `/variants` out of the deferred list, since `/docs` absorbed it.

- [ ] **Step 5: Final full gate**

```bash
pnpm verify && pnpm smoke:full && pnpm smoke:onepage && pnpm lighthouse && pnpm lighthouse:desktop
```

Expected: every command exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add the warm preset and update the docs"
```

---

## Self-Review

**Spec coverage.** Each spec section against a task:

| Spec section | Task |
|---|---|
| §3 Visual direction — editorial default | 1 |
| §3 Visual direction — warm second, `aurora.css` removed | 1 (removal), 6 (warm) |
| §4 New blocks — `features` | 2 |
| §4 New blocks — `cta`, page composition | 3 |
| §5 `/docs` — tokens, blocks, config reference; replaces `/debug` | 5 |
| §5 `/docs` — English-only, excluded from prerender/sitemap/robots | 5 |
| §6 Performance — pre-hydration imports | 4 |
| §6 Budget — mobile ≥ 0.85, desktop ≥ 0.95, both hard | 4 |
| §7 Verification — `/docs` not prerendered | 5 |
| §7 Verification — visual sweep at five widths, both presets, both themes | 1, 2, 3, 6 |
| §8 Shipping context | No task — it constrains Plan 3, and is recorded in the spec |

**Gap found and closed during review:** §5 says `/docs` includes "recipes" — prose on adding a block, adding a variant, reskinning, and the env flags. Task 5's four sections cover tokens, blocks and config, but not recipes. Rather than add a fifth component of hand-written prose that would duplicate the README and drift from it — the exact failure mode `/docs` exists to avoid — **Task 5's route should link to the README sections instead**, and Task 6 Step 3 keeps the README current. Recorded here as a deliberate narrowing of §5; the spec's own principle (derive, don't restate) argues for it.

**Placeholder scan:** none. Two steps deliberately anticipate a failure the implementer will hit rather than pre-solving it — Task 2 Step 4's `max-w-2xl` and Task 5 Step 1's dynamic class names — with the resolution named and the reason for not weakening the rule stated. Both are visible failures, not silent ones.

**Type consistency:** `FeaturesCopy`, `FeatureItem`, `CtaCopy`, `blockModules`, `blocksForCurrentUrl` are each defined once and referenced with matching shapes. `BlockProps` destructuring matches the existing contract in every new component. `--elevation-card` is introduced in Task 1 Step 2's `@theme inline` mapping and consumed by both presets. Registry registration is described identically in Tasks 2 and 3, including the two-object requirement.

**Known-risky surfaces**, where the plan tells the implementer to verify against the installed version rather than trust a signature: TanStack Start's client-entry contract (Task 4 Step 2), whether breaking the eager import chain actually splits the bundle (Task 4 Step 3), and Tailwind's handling of dynamic class names (Task 5 Step 1).
