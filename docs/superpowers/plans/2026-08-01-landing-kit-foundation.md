# Landing Kit Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the landing kit foundation — tokens, layout primitives, block contract, bilingual locale routing, SEO layer, prerendering, and the three swappable boundaries — proven end-to-end by two complete blocks (`hero` with two variants, `contact` with a working form).

**Architecture:** A single-package TanStack Start app. Blocks are self-contained folders declaring a manifest (variants, per-locale copy, JSON-LD contribution); `pages.config.ts` composes them into routes. Everything mode-specific — nav shape, sitemap, metadata, prerender list — derives from that config, so one-page vs multi-page is data, not a code fork. Animation, form submission, and config selection are Vite aliases pointing at interchangeable implementations.

**Tech Stack:** pnpm 11, TypeScript 6.0.3 (exact pin), React 19.2, TanStack Start 1.168, Tailwind CSS 4.3, shadcn/ui (vendored), motion 12.43, Biome 2.5, zod 4.4, react-hook-form 7.83, Lighthouse CI.

**Spec:** `docs/superpowers/specs/2026-08-01-landing-kit-design.md`. Read it before Task 1.

## Global Constraints

Every task's requirements implicitly include this section.

- **TypeScript pinned to exactly `6.0.3`** — no caret. npm `latest` is 7.x (the Go rewrite); an unpinned install silently lands there. Also set `pnpm.overrides.typescript`.
- **No test frameworks.** No Vitest, no Playwright, no Jest. Verification is `biome ci`, `tsc --noEmit`, `pnpm build`, `scripts/verify-build.mjs`, `scripts/check-conventions.mjs`, and looking at the page.
- **Locales are `mn` and `en`; `mn` is the default and is unprefixed.** `/` and `/pricing` are Mongolian; `/en` and `/en/pricing` are English.
- **All variants of a block share one copy type.** Variant-specific fields are optional members of that one type.
- **Blocks are pure prop-driven components.** They receive `{ copy, site, resolve }` and read no context, no hooks-for-data, no router.
- **Blocks never import `motion` directly** — only `~/motion`. Enforced by Biome.
- **Blocks never write `py-section`, `px-gutter`, `max-w-*`, `container`, `min-h-screen`, a raw `<section>`, an arbitrary-value escape, or an inline `style`.** They compose `<Section>` and `<Container>`. Ordinary component padding (`py-3` on a button) is fine. Enforced by `scripts/check-conventions.mjs`.
- **Tailwind utilities, not inline styles.** Tokens are registered in `@theme` so Tailwind generates utilities from them (`py-section`, `px-gutter`, `max-w-page`, `text-display`, `rounded-base`, `font-display`). Do not use `style={{...}}` for anything the token layer covers, and do not use arbitrary-value escapes — `text-[length:var(--text-display)]`, `rounded-[var(--radius)]` — where a generated utility exists. Inline `style` is acceptable only for a genuinely dynamic value that cannot be a class.
- **Mobile-first responsiveness, Tailwind default breakpoints** (`sm` 40rem, `md` 48rem, `lg` 64rem, `xl` 80rem). No horizontal overflow at 320px. Interactive chrome has tap targets ≥ 44px. Every UI-bearing task verifies at 375, 768, 1280 and 1536 plus a 320px overflow check.
- **Every variant must render correctly under `motion.noop`** — no variant may depend on animation to be legible.
- **Every font family used must have Cyrillic coverage**, delivered as per-script `@font-face` rules with distinct `unicode-range` values so a page fetches only the scripts its text uses.
- **Animations use `transform` and `opacity` only** — never layout properties, so they cannot cause CLS.
- **Commit after every task.** Conventional commit prefixes (`feat:`, `chore:`, `fix:`).

## Verification Reality (read this before Task 3)

Because there is no test runner, Tasks 3–5 are verified by `tsc --noEmit`, `biome ci`, and visual inspection in the browser. The first *machine-checked* end-to-end verification of the pure logic (URL enumeration, request resolution, link resolution, head building) arrives in **Task 6**, when `verify-build.mjs` asserts against real prerendered HTML.

This is a real consequence of the no-test-framework decision, not an oversight. Two mitigations are built into the plan: Task 3 adds a `/debug` route that prints resolver output so mistakes are visible immediately, and Task 6's checks are thorough enough to catch logic errors before any block work builds on them. Do not skip Task 6.

## File Structure

| Path | Responsibility |
|---|---|
| `src/shell/types.ts` | `Locale`, `Surface`, `SiteConfig`, `PageConfig`, `BlockRef`, `BlockProps`, `BlockManifest`, `JsonLdNode` |
| `src/config/site.config.ts` | Site-wide facts: name, url, locales, organization, nav, theme mode |
| `src/config/pages.config.ts` | Page list: path, block refs, per-locale SEO copy |
| `src/shell/pages/enumerate.ts` | `pages × locales → PageUrl[]`. Single source of truth for prerender, sitemap, and verification |
| `src/shell/pages/resolve-request.ts` | `pathname → ResolvedPage \| null` |
| `src/shell/pages/resolve-link.ts` | `createResolver()` — target id → href, with locale prefix |
| `src/shell/pages/page-view.tsx` | Renders chrome + the resolved page's blocks |
| `src/shell/blocks/render-blocks.tsx` | Maps `BlockRef[]` to variant components; assigns alternating surfaces |
| `src/shell/seo/build-head.ts` | `ResolvedPage → head object` (title, meta, canonical, hreflang, OG, JSON-LD) |
| `src/shell/seo/json-ld.ts` | Assembles the `@graph` from site config + block contributions |
| `src/shell/seo/emit-plugin.ts` | Vite plugin: emits `sitemap.xml`, `robots.txt`, and `.kit/urls.json` |
| `src/shell/layout/section.tsx` | `<Section>` — vertical rhythm, surface, anchor id |
| `src/shell/layout/container.tsx` | `<Container>` — max-width and gutters |
| `src/shell/chrome/header.tsx` | Nav, locale switcher, theme toggle |
| `src/shell/chrome/footer.tsx` | Footer from site config |
| `src/shell/theme/` | Theme provider, toggle, no-flash inline script |
| `src/motion.animated.tsx` / `src/motion.noop.tsx` | Animation boundary — aliased as `~/motion` |
| `src/submit.server.ts` / `src/submit.endpoint.ts` | Submission boundary — aliased as `~/submit` |
| `src/submit-schema.ts` | zod schema shared by both submit implementations and the form |
| `src/styles/theme.css` | `@theme` token declarations; imports the active preset |
| `src/styles/presets/aurora.css` | Preset 1: palette (light + dark), fonts, radius, density |
| `src/blocks/registry.ts` | The registry map and `BlockId` union |
| `src/blocks/hero/` | manifest, `hero-centered.tsx`, `hero-split.tsx`, copy, schema |
| `src/blocks/contact/` | manifest, `contact-form.tsx`, copy, schema |
| `src/routes/__root.tsx` | HTML shell, `HeadContent`, `Scripts`, no-flash script |
| `src/routes/index.tsx` | Default-locale home |
| `src/routes/$.tsx` | Every other path; 404 when unresolvable |
| `scripts/verify-build.mjs` | Post-build SEO + registry assertions. Zero dependencies |
| `scripts/check-conventions.mjs` | Block convention checks Biome cannot express |

---

### Task 1: Project scaffold, pinned toolchain, Biome

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `biome.json`, `.gitignore`, `src/routes/__root.tsx`, `src/routes/index.tsx`
- Create: `components.json` (shadcn config)

**Interfaces:**
- Consumes: nothing.
- Produces: a running dev server; the `~/*` path alias resolving to `src/*`; scripts `dev`, `build`, `typecheck`, `lint`, `verify`.

- [ ] **Step 1: Scaffold the TanStack Start app**

```bash
cd /Users/tenggis/Desktop/projects/landing_kit
pnpm dlx create-tsrouter-app@latest . --template file-router --framework react --tailwind --package-manager pnpm
```

If the scaffolder refuses to run in a non-empty directory, scaffold into a temp dir and move the files in, preserving the existing `docs/` and `.git/`:

```bash
pnpm dlx create-tsrouter-app@latest /tmp/lk --template file-router --framework react --tailwind --package-manager pnpm
rsync -a --exclude=.git --exclude=docs /tmp/lk/ .
```

- [ ] **Step 2: Pin exact versions**

Replace the `dependencies`/`devDependencies` in `package.json` with these exact specifiers, then add the `pnpm.overrides` block. Note `typescript` has **no caret**.

```json
{
  "type": "module",
  "dependencies": {
    "@tanstack/react-router": "^1.168.0",
    "@tanstack/react-start": "^1.168.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "motion": "^12.43.0",
    "zod": "^4.4.0",
    "react-hook-form": "^7.83.0",
    "@fontsource-variable/inter": "^5.2.0",
    "@fontsource-variable/manrope": "^5.2.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.5.6",
    "@tailwindcss/vite": "^4.3.0",
    "tailwindcss": "^4.3.0",
    "typescript": "6.0.3",
    "vite": "^7.0.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0"
  },
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "lint": "biome ci .",
    "fix": "biome check --write .",
    "conventions": "node scripts/check-conventions.mjs",
    "verify": "pnpm lint && pnpm typecheck && pnpm conventions && pnpm build && node scripts/verify-build.mjs"
  }
}
```

Then pin TypeScript for transitive dependents too. pnpm 11 no longer reads the `pnpm` field
in `package.json` — it warns and ignores it — so the override belongs in
`pnpm-workspace.yaml`:

```yaml
overrides:
  typescript: 6.0.3
```

- [ ] **Step 3: Install and confirm the TypeScript pin held**

```bash
pnpm install
pnpm exec tsc --version
```

Expected: `Version 6.0.3` exactly. If it prints 7.x, the override did not apply — delete `node_modules` and `pnpm-lock.yaml` and reinstall before continuing. Do not proceed on 7.x.

- [ ] **Step 4: Configure `tsconfig.json` with the path alias**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "module": "Preserve",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "paths": {
      "~/*": ["./src/*"]
    }
  },
  "include": ["src", "scripts", "vite.config.ts"]
}
```

**No `baseUrl`.** TypeScript 6.0 raises a hard deprecation error on it, and TS 7 removes it
entirely. `paths` entries resolve relative to the tsconfig's own location without it, so
`baseUrl` buys nothing here — do not add it, and do not add `ignoreDeprecations` to silence
it.

`noUncheckedIndexedAccess` matters here — much of this codebase looks things up by id in records, and it forces those lookups to be checked.

- [ ] **Step 5: Configure Biome, including the motion import boundary**

Create `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.6/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["**", "!src/routeTree.gen.ts"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" } },
  "css": { "parser": { "tailwindDirectives": true } },
  "overrides": [
    {
      "includes": ["src/blocks/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "paths": {
                  "motion": "Blocks must import animation presets from '~/motion', never 'motion' directly.",
                  "motion/react": "Blocks must import animation presets from '~/motion', never 'motion/react' directly.",
                  "~/motion.animated": "Import '~/motion' — the alias selects the implementation."
                }
              }
            }
          }
        }
      }
    }
  ]
}
```

`vcs.useIgnoreFile` matters more than it looks: without it Biome does not read `.gitignore`, so the moment a build leaves a `dist/` behind, `pnpm lint` scans the emitted bundles and drowns in thousands of false positives. Tasks 6 and 9 build repeatedly, so a lint that only works on a pristine tree is a lint nobody can trust.

- [ ] **Step 6: Verify the rule group name is correct for Biome 2.5**

```bash
pnpm exec biome explain noRestrictedImports
```

Read the `group` in the output. If it is not `style`, move the rule into the group Biome reports and re-run. Then confirm the config parses:

```bash
pnpm exec biome check --config-path biome.json src
```

Expected: no configuration errors (lint findings in scaffolded files are fine).

- [ ] **Step 7: Configure Vite with Tailwind and the three boundary aliases**

Create `vite.config.ts`. The env vars are what Task 7 and Task 10 use to build alternate configurations; defaults give the full-featured build.

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const animation = process.env.KIT_ANIMATION ?? 'on'
const submit = process.env.KIT_SUBMIT ?? 'endpoint'
const config = process.env.KIT_CONFIG ?? 'default'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '~/motion': animation === 'on' ? r('./src/motion.animated.tsx') : r('./src/motion.noop.tsx'),
      '~/submit': submit === 'server' ? r('./src/submit.server.ts') : r('./src/submit.endpoint.ts'),
      '~/config': config === 'onepage' ? r('./configs/smoke-onepage') : r('./src/config'),
      '~': r('./src'),
    },
  },
  plugins: [tailwindcss(), tanstackStart()],
})
```

Alias order matters: `~/motion`, `~/submit`, and `~/config` must precede the catch-all `~`.

- [ ] **Step 8: Add `.gitignore` entries**

```
node_modules
dist
.output
.nitro
.tanstack
.kit
.lighthouseci
```

- [ ] **Step 9: Verify the dev server runs**

```bash
pnpm dev
```

Open the printed URL. Expected: the scaffolded page renders with no console errors. Stop the server.

- [ ] **Step 10: Verify lint and types are clean**

```bash
pnpm fix && pnpm lint && pnpm typecheck
```

Expected: both exit 0. Fix any scaffolded-file findings now — a dirty baseline makes every later task ambiguous.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold TanStack Start app with pinned toolchain and Biome"
```

---

### Task 2: Design tokens, preset 1, fonts, layout primitives

**Files:**
- Create: `src/styles/theme.css`, `src/styles/presets/aurora.css`, `src/shell/layout/section.tsx`, `src/shell/layout/container.tsx`, `src/shell/types.ts`
- Modify: `src/routes/__root.tsx`

**Interfaces:**
- Consumes: the `~/*` alias from Task 1.
- Produces: `Surface` type; `<Section id? surface? className? children>`; `<Container width? className? children>`; preset custom properties `--c-background`, `--c-foreground`, `--c-primary`, `--c-primary-foreground`, `--c-muted`, `--c-muted-foreground`, `--c-accent`, `--c-border`, `--c-ring`, `--radius`, `--face-display`, `--face-body`, `--section-y`, `--gutter`, `--width-page`, `--width-narrow`; and the Tailwind utilities generated from them — `py-section`, `px-gutter`, `max-w-page`, `max-w-narrow`, `text-display`, `text-h2`, `text-h3`, `text-lead`, `rounded-base`, `font-display`, `font-body`, plus the palette colour utilities.

- [ ] **Step 1: Verify both fonts ship Cyrillic subsets**

```bash
grep -c cyrillic node_modules/@fontsource-variable/inter/unicode.json
grep -c cyrillic node_modules/@fontsource-variable/manrope/unicode.json
```

Expected: a non-zero count for each, meaning the family ships Cyrillic glyphs. If a family reports zero, it is disqualified by the global constraints — not a matter of taste — so replace it with `@fontsource-variable/golos-text` or IBM Plex Sans and re-check.

**Note on subsets:** Fontsource 5.x does **not** publish per-script entry points like `latin.css` or `cyrillic.css`. It publishes `wght.css`, which contains one `@font-face` per script, each with its own `unicode-range`. That is the mechanism that satisfies the Cyrillic constraint: the browser downloads only the subsets a page's text actually needs, so an English page never fetches Cyrillic woff2. Verify this by confirming the built CSS contains multiple `@font-face` blocks with distinct `unicode-range` values per family.

- [ ] **Step 2: Write the preset**

Create `src/styles/presets/aurora.css`. Both palettes are authored, not derived — the dark surfaces step upward in lightness while saturation drops.

```css
:root {
  /* Skin: font pairing. Both families must have Cyrillic coverage. */
  --face-display: 'Manrope Variable', system-ui, sans-serif;
  --face-body: 'Inter Variable', system-ui, sans-serif;

  /* Skin: shape, rhythm, measure. */
  --radius: 0.75rem;
  --section-y: clamp(3.5rem, 8vw, 7rem);
  --gutter: clamp(1rem, 4vw, 2rem);
  --width-page: 72rem;
  --width-narrow: 36rem;

  /* Skin: light palette. */
  --c-background: oklch(99% 0.004 250);
  --c-foreground: oklch(21% 0.02 255);
  --c-muted: oklch(96.5% 0.006 250);
  --c-muted-foreground: oklch(48% 0.02 255);
  --c-accent: oklch(97% 0.02 250);
  --c-border: oklch(91% 0.008 255);
  --c-primary: oklch(55% 0.19 264);
  --c-primary-foreground: oklch(99% 0.004 250);
  --c-ring: oklch(55% 0.19 264);
}

.dark {
  /* Authored, not derived: dark surfaces step up in lightness and drop saturation. */
  --c-background: oklch(17% 0.015 260);
  --c-foreground: oklch(96% 0.006 250);
  --c-muted: oklch(23% 0.017 260);
  --c-muted-foreground: oklch(72% 0.014 255);
  --c-accent: oklch(27% 0.02 262);
  --c-border: oklch(31% 0.018 260);
  --c-primary: oklch(72% 0.15 264);
  --c-primary-foreground: oklch(17% 0.015 260);
  --c-ring: oklch(72% 0.15 264);
}
```

The `--c-*` / `--face-*` / `--width-*` prefixes exist so `@theme inline` in Step 3 can map them onto Tailwind's namespaces without a variable referring to itself. A preset is swappable precisely because it owns these raw values and nothing else.

- [ ] **Step 3: Write `theme.css`**

Create `src/styles/theme.css`. Each family's `wght.css` carries per-script `@font-face` rules with `unicode-range`, so English pages do not pull Cyrillic glyphs (see Step 1).

```css
@import 'tailwindcss';

@import '@fontsource-variable/inter/wght.css';
@import '@fontsource-variable/manrope/wght.css';

@import './presets/aurora.css';

@custom-variant dark (&:where(.dark, .dark *));

/* System, not skin: the scale is fixed, the font pairing is not. */
@theme {
  --text-display: clamp(2.5rem, 6vw, 4.5rem);
  --text-h2: clamp(1.875rem, 3.5vw, 2.75rem);
  --text-h3: clamp(1.25rem, 2vw, 1.5rem);
  --text-lead: clamp(1.0625rem, 1.4vw, 1.25rem);
}

/* `inline` keeps these as live var() references, so the .dark class and a
   preset swap both take effect without a rebuild. */
@theme inline {
  --color-background: var(--c-background);
  --color-foreground: var(--c-foreground);
  --color-muted: var(--c-muted);
  --color-muted-foreground: var(--c-muted-foreground);
  --color-accent: var(--c-accent);
  --color-border: var(--c-border);
  --color-primary: var(--c-primary);
  --color-primary-foreground: var(--c-primary-foreground);
  --color-ring: var(--c-ring);

  --font-display: var(--face-display);
  --font-body: var(--face-body);

  --radius-base: var(--radius);
  --spacing-section: var(--section-y);
  --spacing-gutter: var(--gutter);
  --container-page: var(--width-page);
  --container-narrow: var(--width-narrow);
}

@layer base {
  html {
    font-family: var(--face-body);
    scroll-behavior: smooth;
  }
  body {
    background-color: var(--c-background);
    color: var(--c-foreground);
  }
  h1, h2, h3 {
    font-family: var(--face-display);
    letter-spacing: -0.02em;
  }
  :focus-visible {
    outline: 2px solid var(--c-ring);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
  }
}
```

Those registrations are what make the rest of the codebase Tailwind-idiomatic. Because of them the following utilities exist and must be used in place of inline styles or arbitrary values:

| Utility | Resolves to |
|---|---|
| `py-section` | the preset's vertical section rhythm |
| `px-gutter` | the preset's horizontal gutter |
| `max-w-page` / `max-w-narrow` | the preset's page and narrow measures |
| `text-display`, `text-h2`, `text-h3`, `text-lead` | the fluid type scale |
| `rounded-base` | the preset's radius |
| `font-display`, `font-body` | the preset's font pairing |
| `bg-background`, `text-foreground`, `bg-muted`, `text-muted-foreground`, `bg-accent`, `border-border`, `bg-primary`, `text-primary-foreground`, `ring-ring` | palette tokens, dark-mode aware |

After Step 3, verify a generated utility actually exists rather than assuming: run `pnpm build` and grep the emitted CSS for `.py-section` and `.text-display`. If Tailwind did not generate them, the `@theme` namespaces are wrong and everything downstream inherits the problem — fix it here.

- [ ] **Step 4: Define the shared types**

Create `src/shell/types.ts`. This file is the contract every later task reads.

```ts
import type { ReactNode } from 'react'

export type Locale = 'mn' | 'en'
export type Surface = 'default' | 'muted' | 'accent'

export type JsonLdNode = Record<string, unknown>

export type Address = {
  country: string
  region?: string
  city?: string
  street?: string
  postalCode?: string
}

export type SiteConfig = {
  name: string
  url: string
  defaultLocale: Locale
  locales: Locale[]
  /** Root-relative path to the fallback OG image, used by pages with no own `ogImage`. */
  ogImageDefault: string
  organization: {
    kind: 'Organization' | 'LocalBusiness'
    legalName?: string
    logo: string
    email?: string
    phone?: string
    address?: Address
    sameAs?: string[]
  }
  nav: { target: string }[]
  theme: { mode: 'light' | 'dark' | 'both'; default?: 'light' | 'dark' }
}

export type SeoCopy = { title: string; description: string; ogImage?: string }

export type BlockRef<Id extends string = string> =
  | Id
  | { id: Id; variant?: string; surface?: Surface }

export type PageConfig<Id extends string = string> = {
  id: string
  path: string
  blocks: BlockRef<Id>[]
  seo: Record<Locale, SeoCopy>
}

export type BlockProps<C> = {
  copy: C
  site: SiteConfig
  resolve: (target: string) => string
  /** Assigned by the renderer; the block hands it to its own <Section>. */
  surface: Surface
  /**
   * Unique anchor id for THIS instance. The renderer de-duplicates repeats, so a
   * block must never hardcode its own id — a page may legitimately carry the same
   * block twice (two CTAs, say), and duplicate ids are invalid HTML that also break
   * anchor links.
   */
  anchorId: string
}

export type BlockSchema<C> = (ctx: {
  copy: C
  site: SiteConfig
  page: PageConfig
}) => JsonLdNode[]

export type BlockManifest<C = any, V extends string = string> = {
  id: string
  variants: Record<V, (props: BlockProps<C>) => ReactNode>
  defaultVariant: V
  copy: Record<Locale, C>
  nav?: { labelKey: keyof C & string }
  schema?: BlockSchema<C>
  requires?: { npm?: string[]; ui?: string[] }
}
```

- [ ] **Step 5: Write `<Container>`**

Create `src/shell/layout/container.tsx`:

```tsx
import type { ReactNode } from 'react'

const WIDTH = {
  page: 'max-w-page',
  narrow: 'max-w-narrow',
} as const

export function Container({
  width = 'page',
  className = '',
  children,
}: {
  width?: keyof typeof WIDTH
  className?: string
  children: ReactNode
}) {
  return <div className={`mx-auto w-full px-gutter ${WIDTH[width]} ${className}`}>{children}</div>
}
```

The `width` prop exists so no block ever needs a `max-w-*` class of its own — a form or prose column asks for `<Container width="narrow">` instead. That keeps the convention rule absolute rather than carrying an exception list.

- [ ] **Step 6: Write `<Section>`**

Create `src/shell/layout/section.tsx`. `id` is what `resolve()` targets for anchors.

```tsx
import type { ReactNode } from 'react'
import type { Surface } from '~/shell/types'

const SURFACE_CLASS: Record<Surface, string> = {
  default: 'bg-background text-foreground',
  muted: 'bg-muted text-foreground',
  accent: 'bg-accent text-foreground',
}

export function Section({
  id,
  surface = 'default',
  className = '',
  children,
}: {
  id?: string
  surface?: Surface
  className?: string
  children: ReactNode
}) {
  return (
    <section id={id} className={`py-section ${SURFACE_CLASS[surface]} ${className}`}>
      {children}
    </section>
  )
}
```

- [ ] **Step 7: Wire the stylesheet into the root route**

Modify `src/routes/__root.tsx` so it imports the stylesheet and renders the head/scripts outlets. Keep whatever the scaffolder generated for `createRootRoute`, and ensure the document shell matches this shape:

```tsx
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import '~/styles/theme.css'

export const Route = createRootRoute({
  component: RootDocument,
})

function RootDocument() {
  return (
    <html lang="mn">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
```

The hardcoded `lang="mn"` is replaced in Task 4.

- [ ] **Step 8: Render a temporary smoke page**

Replace the body of `src/routes/index.tsx` with a primitives smoke test:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <>
      <Section>
        <Container>
          <h1 className="text-display font-bold">Гарчиг / Heading</h1>
          <p className="text-muted-foreground text-lead mt-4">
            Кирилл болон латин үсэг. Latin and Cyrillic.
          </p>
        </Container>
      </Section>
      <Section surface="muted">
        <Container width="narrow">
          <h2 className="text-h2 font-semibold">Second surface, narrow measure</h2>
        </Container>
      </Section>
    </>
  )
}
```

- [ ] **Step 9: Verify visually, in both palettes and both scripts**

```bash
pnpm dev
```

Check all of these, since each catches a different failure:
1. The two sections have visibly different backgrounds (surface tokens work).
2. Cyrillic and Latin text render in the same typeface — not a system fallback. Confirm in devtools: computed `font-family` resolves to Inter/Manrope for the Cyrillic line.
3. In devtools, add `class="dark"` to `<html>`; the palette switches and text stays legible.
4. The second section is visibly narrower than the first (`width="narrow"` works).
5. **Responsive sweep at 320, 375, 768, 1280 and 1536 px.** Use devtools device emulation rather than resizing the OS window — window managers impose a minimum width well above 320px, so a real 320px check is otherwise impossible. At every width: no horizontal scrollbar, no clipped text, heading scales continuously rather than jumping.
6. Confirm the generated utilities are real, not silently-dropped class names: in devtools inspect the `<section>` and check the computed `padding-block` is non-zero and traces to `.py-section`, and that the `<h1>`'s `font-size` traces to `.text-display`. A missing `@theme` namespace produces a class that exists in the markup and does nothing.

Stop the server.

- [ ] **Step 10: Verify lint and types**

```bash
pnpm lint && pnpm typecheck
```

Expected: both exit 0.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add design tokens, aurora preset, fonts, and layout primitives"
```

---

### Task 3: Block contract, registry, hero block with two variants

**Files:**
- Create: `src/blocks/registry.ts`, `src/blocks/hero/manifest.ts`, `src/blocks/hero/hero-centered.tsx`, `src/blocks/hero/hero-split.tsx`, `src/blocks/hero/copy.mn.ts`, `src/blocks/hero/copy.en.ts`, `src/blocks/hero/schema.ts`, `src/shell/blocks/render-blocks.tsx`
- Modify: `src/routes/index.tsx`

**Interfaces:**
- Consumes: `BlockManifest`, `BlockProps`, `BlockSchema`, `Surface`, `SiteConfig`, `PageConfig` from `src/shell/types.ts` (Task 2); `<Section>`, `<Container>` (Task 2).
- Produces: `registry`, `type BlockId`; `<RenderBlocks blocks locale site resolve page>`; the hero manifest as the reference every later block copies.

- [ ] **Step 1: Declare the copy type and write the Mongolian copy**

Create `src/blocks/hero/copy.mn.ts`. The type is declared explicitly rather than inferred with `typeof mn`, because **only an explicit type can mark a variant-specific field optional** — and that optionality is the mechanism that lets two variants share one copy type. Inference from a literal always produces required fields.

```ts
export type HeroCopy = {
  navLabel: string
  eyebrow: string
  heading: string
  lead: string
  primaryCta: { label: string; target: string }
  secondaryCta: { label: string; target: string }
  /** `split` variant only — optional, so `centered` is not forced to supply it. */
  image?: { src: string; alt: string; width: number; height: number }
}

export const mn: HeroCopy = {
  navLabel: 'Эхлэл',
  eyebrow: 'Шинэ',
  heading: 'Бизнесээ онлайнаар хөгжүүл',
  lead: 'Хурдан, хайлтын системд оновчлогдсон вэб хуудсыг хоногийн дотор нэвтрүүл.',
  primaryCta: { label: 'Холбоо барих', target: 'hero' },
  secondaryCta: { label: 'Дэлгэрэнгүй', target: 'hero' },
  image: { src: '/hero.jpg', alt: 'Бүтээгдэхүүний зураг', width: 1200, height: 900 },
}
```

The explicit type costs one declaration and buys two things: optional variant fields, and a readable summary of the block's copy shape for whoever extends it. Locale parity is unaffected — it comes from `en: HeroCopy` in the next step, not from the type's origin.

- [ ] **Step 2: Write the English copy against that type**

Create `src/blocks/hero/copy.en.ts`:

```ts
import type { HeroCopy } from './copy.mn'

export const en: HeroCopy = {
  navLabel: 'Home',
  eyebrow: 'New',
  heading: 'Grow your business online',
  lead: 'Ship a fast, search-optimised landing page in a day.',
  primaryCta: { label: 'Get in touch', target: 'hero' },
  secondaryCta: { label: 'Learn more', target: 'hero' },
  image: { src: '/hero.jpg', alt: 'Product screenshot', width: 1200, height: 900 },
}
```

- [ ] **Step 3: Prove locale parity is enforced**

Temporarily delete the `lead` line from `copy.en.ts`, then:

```bash
pnpm typecheck
```

Expected: FAIL, with an error on `copy.en.ts` reporting `lead` is missing. Restore the line and re-run — expected: exit 0. This step exists because locale parity replaces a test suite; confirm the mechanism actually works before writing seven more blocks on top of it.

- [ ] **Step 4: Write the `centered` variant**

Create `src/blocks/hero/hero-centered.tsx`. Note: no `py-*`, no `max-w-*`, no raw `<section>` — those come from the primitives.

```tsx
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'
import type { BlockProps } from '~/shell/types'
import type { HeroCopy } from './copy.mn'

export function HeroCentered({ copy, resolve, surface, anchorId }: BlockProps<HeroCopy>) {
  return (
    <Section id={anchorId} surface={surface}>
      <Container className="text-center">
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">{copy.eyebrow}</p>
        <h1 className="mt-3 text-display font-bold text-balance">
          {copy.heading}
        </h1>
        <p className="text-muted-foreground mx-auto mt-5 text-lead text-pretty">
          {copy.lead}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={resolve(copy.primaryCta.target)}
            className="bg-primary text-primary-foreground rounded-base inline-flex min-h-11 items-center px-6 py-3 font-medium"
          >
            {copy.primaryCta.label}
          </a>
          <a
            href={resolve(copy.secondaryCta.target)}
            className="border-border rounded-base inline-flex min-h-11 items-center border px-6 py-3 font-medium"
          >
            {copy.secondaryCta.label}
          </a>
        </div>
      </Container>
    </Section>
  )
}
```

- [ ] **Step 5: Write the `split` variant**

Create `src/blocks/hero/hero-split.tsx`. The image carries explicit `width`/`height` and `fetchPriority="high"` per the global constraints.

```tsx
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'
import type { BlockProps } from '~/shell/types'
import type { HeroCopy } from './copy.mn'

export function HeroSplit({ copy, resolve, surface, anchorId }: BlockProps<HeroCopy>) {
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <p className="text-primary text-sm font-semibold tracking-wide uppercase">
              {copy.eyebrow}
            </p>
            <h1 className="mt-3 text-display font-bold text-balance">
              {copy.heading}
            </h1>
            <p className="text-muted-foreground mt-5 text-lead text-pretty">
              {copy.lead}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={resolve(copy.primaryCta.target)}
                className="bg-primary text-primary-foreground rounded-base px-6 py-3 font-medium"
              >
                {copy.primaryCta.label}
              </a>
              <a
                href={resolve(copy.secondaryCta.target)}
                className="border-border rounded-base border px-6 py-3 font-medium"
              >
                {copy.secondaryCta.label}
              </a>
            </div>
          </div>
          {copy.image ? (
            <img
              src={copy.image.src}
              alt={copy.image.alt}
              width={copy.image.width}
              height={copy.image.height}
              fetchPriority="high"
              className="rounded-base w-full h-auto"
            />
          ) : null}
        </div>
      </Container>
    </Section>
  )
}
```

- [ ] **Step 6: Write the schema contribution**

Create `src/blocks/hero/schema.ts`:

```ts
import type { BlockSchema } from '~/shell/types'
import type { HeroCopy } from './copy.mn'

export const schema: BlockSchema<HeroCopy> = ({ copy, site }) => [
  {
    '@type': 'WebPageElement',
    name: copy.heading,
    description: copy.lead,
    isPartOf: { '@id': `${site.url}/#website` },
  },
]
```

- [ ] **Step 7: Write the manifest**

Create `src/blocks/hero/manifest.ts`:

```ts
import type { BlockManifest } from '~/shell/types'
import { en } from './copy.en'
import { type HeroCopy, mn } from './copy.mn'
import { HeroCentered } from './hero-centered'
import { HeroSplit } from './hero-split'
import { schema } from './schema'

export const hero = {
  id: 'hero',
  variants: { centered: HeroCentered, split: HeroSplit },
  defaultVariant: 'centered',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  schema,
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<HeroCopy, 'centered' | 'split'>
```

- [ ] **Step 8: Prove `defaultVariant` is type-checked**

Temporarily change `defaultVariant` to `'centred'` (misspelled), then:

```bash
pnpm typecheck
```

Expected: FAIL, reporting `'centred'` is not assignable to `'centered' | 'split'`. Restore it and re-run — expected: exit 0.

- [ ] **Step 9: Write the registry**

Create `src/blocks/registry.ts`:

```ts
import type { BlockManifest } from '~/shell/types'
import { hero } from './hero/manifest'

export const registry = {
  hero,
} satisfies Record<string, BlockManifest<any, any>>

export type BlockId = keyof typeof registry
```

- [ ] **Step 10: Write the block renderer with automatic surface alternation**

Create `src/shell/blocks/render-blocks.tsx`. Alternation is index-based and skipped when a ref sets `surface` explicitly.

```tsx
import { type BlockId, registry } from '~/blocks/registry'
import type { BlockRef, Locale, PageConfig, SiteConfig, Surface } from '~/shell/types'

const ALTERNATION: Surface[] = ['default', 'muted']

function normalize(ref: BlockRef<BlockId>): { id: BlockId; variant?: string; surface?: Surface } {
  return typeof ref === 'string' ? { id: ref } : ref
}

export function RenderBlocks({
  blocks,
  locale,
  site,
  resolve,
}: {
  blocks: BlockRef<BlockId>[]
  locale: Locale
  site: SiteConfig
  resolve: (target: string) => string
}) {
  const seen = new Map<string, number>()

  return (
    <>
      {blocks.map((ref, index) => {
        const { id, variant, surface } = normalize(ref)

        const manifest = registry[id]
        if (!manifest) {
          throw new Error(
            `Unknown block id '${id}'. Available: ${Object.keys(registry).join(', ')}`,
          )
        }

        const variantName = variant ?? manifest.defaultVariant
        // The cast is paired with the throw below — do not remove one without the other.
        const Component = manifest.variants[variantName as keyof typeof manifest.variants]
        if (!Component) {
          throw new Error(
            `Block '${id}' has no variant '${variantName}'. Available: ${Object.keys(manifest.variants).join(', ')}`,
          )
        }

        // De-duplicate anchor ids: first 'cta' is #cta, a second becomes #cta-2.
        const occurrence = (seen.get(id) ?? 0) + 1
        seen.set(id, occurrence)
        const anchorId = occurrence === 1 ? id : `${id}-${occurrence}`

        return (
          <Component
            key={`${id}-${variantName}-${index}`}
            copy={manifest.copy[locale]}
            site={site}
            resolve={resolve}
            // The trailing 'default' satisfies noUncheckedIndexedAccess; a modulo
            // index into ALTERNATION can never actually miss.
            surface={surface ?? ALTERNATION[index % ALTERNATION.length] ?? 'default'}
            anchorId={anchorId}
          />
        )
      })}
    </>
  )
}
```

Surface travels as a prop rather than as a wrapper element because blocks own their own
`<Section>` — wrapping would put the background outside the padded region. `PageConfig` is
imported for the `BlockRef` type only; JSON-LD assembly reads the page in Task 5's
`json-ld.ts`, not here.

- [ ] **Step 11: Render hero on the home route temporarily**

Replace `src/routes/index.tsx` with a temporary harness — Task 4 replaces this with config-driven resolution:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { registry } from '~/blocks/registry'
import { RenderBlocks } from '~/shell/blocks/render-blocks'
import type { PageConfig, SiteConfig } from '~/shell/types'

export const Route = createFileRoute('/')({ component: Home })

const site = {
  name: 'Landing Kit',
  url: 'https://example.mn',
  defaultLocale: 'mn',
  locales: ['mn', 'en'],
  organization: { kind: 'Organization', logo: '/logo.svg' },
  nav: [],
  theme: { mode: 'both', default: 'light' },
} satisfies SiteConfig

const page: PageConfig<keyof typeof registry> = {
  id: 'home',
  path: '/',
  blocks: ['hero', { id: 'hero', variant: 'split' }],
  seo: {
    mn: { title: 'Эхлэл', description: 'Түр зуурын хуудас' },
    en: { title: 'Home', description: 'Temporary page' },
  },
}

function Home() {
  return (
    <RenderBlocks blocks={page.blocks} locale="mn" site={site} resolve={(t) => `#${t}`} />
  )
}
```

- [ ] **Step 12: Verify both variants render and alternate**

```bash
pnpm dev
```

Expected: two hero sections stacked — the first centered, the second split (text left, image placeholder right) — on **different** background surfaces. The image will 404 until an asset exists; that is fine, but confirm the layout does not shift when it fails (explicit width/height doing its job).

Then run the responsive sweep in devtools device emulation at 320, 375, 768, 1280 and 1536 px. At every width: no horizontal scrollbar, no clipped or overlapping text, and CTA buttons at least 44px tall. The `split` variant must stack to one column below `md` with the image below the text, not squeeze into two narrow columns.

- [ ] **Step 13: Verify lint, types, and the import boundary**

```bash
pnpm lint && pnpm typecheck
```

Then prove the Biome boundary works: add `import { motion } from 'motion/react'` to `hero-centered.tsx` and run `pnpm lint`. Expected: FAIL naming `noRestrictedImports`. Remove the import and re-run — expected: exit 0.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: add block contract, registry, and hero block with two variants"
```

---

### Task 4: Configs, URL enumeration, locale routing, chrome

**Files:**
- Create: `src/config/site.config.ts`, `src/config/pages.config.ts`, `src/shell/pages/enumerate.ts`, `src/shell/pages/resolve-request.ts`, `src/shell/pages/resolve-link.ts`, `src/shell/pages/page-view.tsx`, `src/shell/chrome/header.tsx`, `src/shell/chrome/footer.tsx`, `src/routes/$.tsx`, `src/routes/debug.tsx`
- Modify: `src/routes/index.tsx`, `src/routes/__root.tsx`

**Interfaces:**
- Consumes: `registry`, `BlockId`, `RenderBlocks` (Task 3); all types from `src/shell/types.ts`.
- Produces: `site`, `pages`; `enumerateUrls(pages, site) → PageUrl[]`; `resolveRequest(pathname, pages, site) → ResolvedPage | null`; `createResolver(ctx) → (target: string) => string`; `<PageView resolved>`.

- [ ] **Step 1: Write the site config**

Create `src/config/site.config.ts`:

```ts
import type { SiteConfig } from '~/shell/types'

export const site = {
  name: 'Landing Kit',
  url: 'https://example.mn',
  defaultLocale: 'mn',
  locales: ['mn', 'en'],
  ogImageDefault: '/og-default.jpg',
  organization: {
    kind: 'LocalBusiness',
    legalName: 'Landing Kit LLC',
    logo: '/logo.svg',
    email: 'hello@example.mn',
    phone: '+976 7000 0000',
    address: { country: 'MN', city: 'Ulaanbaatar', street: 'Peace Avenue 1', postalCode: '14200' },
    sameAs: ['https://www.facebook.com/example'],
  },
  nav: [{ target: 'hero' }],
  theme: { mode: 'both', default: 'light' },
} satisfies SiteConfig
```

**Only `hero` in `nav` for now.** The header calls `resolve()` on every nav target, and the resolver throws on a target that matches no page and no placed block. `contact` is neither until Task 8, so listing it here would crash every page render. Task 8 adds `{ target: 'contact' }` at the same moment it registers the block — same reason the hero CTAs point at `'hero'` until then.

- [ ] **Step 2: Write the pages config**

Create `src/config/pages.config.ts`. **The `BlockId` import must be `import type`** — a runtime import would pull React components into `vite.config.ts` when it reads this file for the prerender list.

```ts
import type { BlockId } from '~/blocks/registry'
import type { PageConfig } from '~/shell/types'

export const pages: PageConfig<BlockId>[] = [
  {
    id: 'home',
    path: '/',
    blocks: ['hero'],
    seo: {
      mn: { title: 'Эхлэл', description: 'Хурдан, хайлтад оновчлогдсон вэб хуудас.' },
      en: { title: 'Home', description: 'A fast, search-optimised landing page.' },
    },
  },
  {
    id: 'contact',
    path: '/contact',
    blocks: ['contact'],
    seo: {
      mn: { title: 'Холбоо барих', description: 'Бидэнтэй холбогдоорой.' },
      en: { title: 'Contact', description: 'Get in touch with us.' },
    },
  },
]
```

`'contact'` will not typecheck until Task 8 registers that block. Comment the second page out for now and uncomment it in Task 8 — leave a `// TASK 8: uncomment` marker so it is not forgotten.

- [ ] **Step 3: Write the URL enumerator**

Create `src/shell/pages/enumerate.ts`. This is the single source of truth for prerendering, the sitemap, and verification.

```ts
import type { Locale, PageConfig, SiteConfig } from '~/shell/types'

export type PageUrl = {
  pageId: string
  locale: Locale
  path: string
  outputPath: string
}

export function localePath(path: string, locale: Locale, site: SiteConfig): string {
  if (locale === site.defaultLocale) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

export function enumerateUrls(pages: PageConfig[], site: SiteConfig): PageUrl[] {
  const urls: PageUrl[] = []
  for (const page of pages) {
    for (const locale of site.locales) {
      const path = localePath(page.path, locale, site)
      urls.push({
        pageId: page.id,
        locale,
        path,
        outputPath: `${path === '/' ? '' : path}/index.html`,
      })
    }
  }
  return urls
}
```

- [ ] **Step 4: Write the request resolver**

Create `src/shell/pages/resolve-request.ts`:

```ts
import type { Locale, PageConfig, SiteConfig } from '~/shell/types'

export type ResolvedPage<Id extends string = string> = {
  locale: Locale
  page: PageConfig<Id>
  path: string
}

/**
 * The single canonical path normalization for the whole app: drop the query,
 * collapse repeated slashes, drop a trailing slash. Everything downstream —
 * including the header's locale switcher — must consume the result of this,
 * never a raw pathname. Two different normalizations that agree only on clean
 * input is how `//en` turns into a protocol-relative `href="//en"`.
 */
export function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split('?')[0] ?? '/'
  const collapsed = withoutQuery.replace(/\/{2,}/g, '/')
  const trimmed = collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed
  return trimmed || '/'
}

export function resolveRequest<Id extends string>(
  pathname: string,
  pages: PageConfig<Id>[],
  site: SiteConfig,
): ResolvedPage<Id> | null {
  const path = normalizePath(pathname)

  const segments = path.split('/').filter(Boolean)
  const first = segments[0]
  const prefixed = site.locales.find((l) => l !== site.defaultLocale && l === first)

  const locale: Locale = prefixed ?? site.defaultLocale
  const rest = prefixed ? `/${segments.slice(1).join('/')}` : path
  const pagePath = normalizePath(rest)

  const page = pages.find((p) => p.path === pagePath)
  if (!page) return null

  return { locale, page, path }
}
```

- [ ] **Step 5: Write the link resolver**

Create `src/shell/pages/resolve-link.ts`. The three-rule ordering here is what keeps blocks free of hardcoded hrefs.

```ts
import { registry } from '~/blocks/registry'
import type { PageConfig, SiteConfig } from '~/shell/types'
import { localePath } from './enumerate'
import type { ResolvedPage } from './resolve-request'

export function createResolver<Id extends string>(
  resolved: ResolvedPage<Id>,
  pages: PageConfig<Id>[],
  site: SiteConfig,
): (target: string) => string {
  const { locale, page } = resolved

  const blockIdsOn = (p: PageConfig<Id>): string[] =>
    p.blocks.map((b) => (typeof b === 'string' ? b : b.id))

  return (target: string): string => {
    const targetPage = pages.find((p) => p.id === target)
    if (targetPage) return localePath(targetPage.path, locale, site)

    if (blockIdsOn(page).includes(target)) return `#${target}`

    const owner = pages.find((p) => blockIdsOn(p).includes(target))
    if (owner) return `${localePath(owner.path, locale, site)}#${target}`

    if (target in registry) {
      throw new Error(`Link target '${target}' is a known block but is not placed on any page.`)
    }
    throw new Error(`Link target '${target}' matches no page id and no block id.`)
  }
}
```

- [ ] **Step 6: Write the chrome**

Create `src/shell/chrome/header.tsx`. Nav labels come from page SEO titles or block `nav.labelKey`.

```tsx
import { registry } from '~/blocks/registry'
import { pages } from '~/config/pages.config'
import { Container } from '~/shell/layout/container'
import type { Locale, SiteConfig } from '~/shell/types'
import { localePath } from '~/shell/pages/enumerate'

function labelFor(target: string, locale: Locale): string {
  const page = pages.find((p) => p.id === target)
  if (page) return page.seo[locale].title

  const manifest = registry[target as keyof typeof registry]
  if (manifest?.nav) {
    const copy = manifest.copy[locale] as Record<string, unknown>
    const label = copy[manifest.nav.labelKey]
    if (typeof label === 'string') return label
  }
  return target
}

export function Header({
  site,
  locale,
  path,
  resolve,
}: {
  site: SiteConfig
  locale: Locale
  path: string
  resolve: (target: string) => string
}) {
  const others = site.locales.filter((l) => l !== locale)
  const navLabel = locale === 'mn' ? 'Үндсэн цэс' : 'Main navigation'

  const pageLinks = site.nav.map((item) => (
    <a
      key={item.target}
      href={resolve(item.target)}
      className="hover:text-primary flex min-h-11 items-center"
    >
      {labelFor(item.target, locale)}
    </a>
  ))

  const localeLinks = others.map((l) => (
    <a
      key={l}
      href={switchLocale(path, locale, l, site)}
      hrefLang={l}
      className="text-muted-foreground hover:text-primary flex min-h-11 items-center uppercase"
    >
      {l}
    </a>
  ))

  return (
    <header className="border-border bg-background/80 sticky top-0 z-50 border-b backdrop-blur">
      <Container className="flex items-center justify-between gap-4 py-3">
        <a
          href={localePath('/', locale, site)}
          className="font-display flex min-h-11 items-center font-bold"
        >
          {site.name}
        </a>

        <nav aria-label={navLabel} className="hidden items-center gap-6 text-sm md:flex">
          {pageLinks}
          {localeLinks}
        </nav>

        <details className="relative md:hidden">
          <summary
            aria-label={locale === 'mn' ? 'Цэс' : 'Menu'}
            className="border-border rounded-base flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center border [&::-webkit-details-marker]:hidden"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ☰
            </span>
          </summary>
          <nav
            aria-label={navLabel}
            className="border-border bg-background rounded-base absolute right-0 z-50 mt-2 flex w-56 flex-col border p-3 text-sm shadow-lg"
          >
            {pageLinks}
            <span className="border-border my-2 border-t" aria-hidden="true" />
            {localeLinks}
          </nav>
        </details>
      </Container>
    </header>
  )
}

function switchLocale(path: string, from: Locale, to: Locale, site: SiteConfig): string {
  if (from === site.defaultLocale) return localePath(normalizePath(path), to, site)

  // Strip the locale by segment, matching how resolveRequest reads it — not with a
  // prefix regex, which silently fails to match on any non-canonical path.
  const segments = normalizePath(path).split('/').filter(Boolean)
  const bare = `/${segments.slice(1).join('/')}`
  return localePath(normalizePath(bare), to, site)
}
```

The mobile menu is a `<details>`/`<summary>` disclosure rather than a JS-driven drawer, deliberately: it works in prerendered HTML before hydration, which matters when the whole point of this kit is fast static pages. It also needs no state, no effect, and no event handler — so it cannot break the prerender. `min-h-11`/`min-w-11` on every interactive target is the 44px accessibility floor.

Create `src/shell/chrome/footer.tsx`:

```tsx
import { Container } from '~/shell/layout/container'
import type { SiteConfig } from '~/shell/types'

export function Footer({ site }: { site: SiteConfig }) {
  const { organization: org } = site
  return (
    <footer className="border-border bg-muted border-t">
      <Container className="text-muted-foreground flex flex-wrap justify-between gap-4 py-10 text-sm">
        <p>
          © {site.name}
          {org.legalName ? ` · ${org.legalName}` : ''}
        </p>
        <p className="flex gap-4">
          {org.email ? <a href={`mailto:${org.email}`}>{org.email}</a> : null}
          {org.phone ? <a href={`tel:${org.phone.replace(/\s/g, '')}`}>{org.phone}</a> : null}
        </p>
      </Container>
    </footer>
  )
}
```

- [ ] **Step 7: Write the page view**

Create `src/shell/pages/page-view.tsx`:

```tsx
import type { BlockId } from '~/blocks/registry'
import { pages } from '~/config/pages.config'
import { site } from '~/config/site.config'
import { RenderBlocks } from '~/shell/blocks/render-blocks'
import { createResolver } from '~/shell/pages/resolve-link'
import type { ResolvedPage } from '~/shell/pages/resolve-request'
import { Footer } from '~/shell/chrome/footer'
import { Header } from '~/shell/chrome/header'

export function PageView({ resolved }: { resolved: ResolvedPage<BlockId> }) {
  const resolve = createResolver(resolved, pages, site)
  return (
    <>
      <Header site={site} locale={resolved.locale} path={resolved.path} resolve={resolve} />
      <main>
        <RenderBlocks
          blocks={resolved.page.blocks}
          locale={resolved.locale}
          site={site}
          resolve={resolve}
        />
      </main>
      <Footer site={site} />
    </>
  )
}
```

- [ ] **Step 8: Wire the two routes**

Replace `src/routes/index.tsx`:

```tsx
import { createFileRoute, notFound } from '@tanstack/react-router'
import { pages } from '~/config/pages.config'
import { site } from '~/config/site.config'
import { PageView } from '~/shell/pages/page-view'
import { resolveRequest } from '~/shell/pages/resolve-request'

export const Route = createFileRoute('/')({
  loader: () => {
    const resolved = resolveRequest('/', pages, site)
    if (!resolved) throw notFound()
    return resolved
  },
  component: HomeRoute,
})

function HomeRoute() {
  return <PageView resolved={Route.useLoaderData()} />
}
```

Create `src/routes/$.tsx` for every other path:

```tsx
import { createFileRoute, notFound } from '@tanstack/react-router'
import { pages } from '~/config/pages.config'
import { site } from '~/config/site.config'
import { PageView } from '~/shell/pages/page-view'
import { resolveRequest } from '~/shell/pages/resolve-request'

export const Route = createFileRoute('/$')({
  loader: ({ params }) => {
    const splat = (params as { _splat?: string })._splat ?? ''
    const resolved = resolveRequest(`/${splat}`, pages, site)
    if (!resolved) throw notFound()
    return resolved
  },
  component: SplatRoute,
})

function SplatRoute() {
  return <PageView resolved={Route.useLoaderData()} />
}
```

Named component functions rather than inline arrows, because an inline `component: () => <… {...Route.useLoaderData()} />` references `Route` inside its own initializer. It works at runtime (the closure runs later), but it reads as a circular reference and gives worse component names in React devtools.

If the generated route id for the splat file differs from `'/$'`, use whatever `routeTree.gen.ts` produced — do not fight the generator.

- [ ] **Step 9: Add the debug route**

Create `src/routes/debug.tsx`. This is the visible check standing in for unit tests on the pure logic; Task 10 confirms it is excluded from prerendering.

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { pages } from '~/config/pages.config'
import { site } from '~/config/site.config'
import { enumerateUrls } from '~/shell/pages/enumerate'

export const Route = createFileRoute('/debug')({
  component: () => (
    <pre className="p-6 text-xs">{JSON.stringify(enumerateUrls(pages, site), null, 2)}</pre>
  ),
})
```

- [ ] **Step 10: Set `<html lang>` from the resolved locale**

`__root.tsx` renders `<html>`, but the locale is resolved in a child route's loader, so the root has to read it back out of the matched routes. Replace the hardcoded `lang="mn"` with:

```tsx
import { useRouterState } from '@tanstack/react-router'
import { site } from '~/config/site.config'

function useActiveLocale(): string {
  const matches = useRouterState({ select: (s) => s.matches })
  for (let i = matches.length - 1; i >= 0; i--) {
    const data = matches[i]?.loaderData as { locale?: string } | undefined
    if (data?.locale) return data.locale
  }
  return site.defaultLocale
}
```

Then `const lang = useActiveLocale()` in `RootDocument` and `<html lang={lang}>`.

The loop walks matches from the deepest inward so the page route's locale wins, and falls back to the configured default for routes with no loader (a 404, say). A plain reverse loop rather than `findLast`, because the tsconfig targets ES2022 and `Array.prototype.findLast` is ES2023.

**Verify immediately, not later:** run `pnpm dev`, open `/en`, and confirm View Source shows `<html lang="en">` while `/` shows `<html lang="mn">`. Task 6 asserts this mechanically, but debugging it here — with one route and no prerender in the way — is far cheaper than debugging it inside a failing build assertion.

If `useRouterState` is unavailable or shaped differently in the installed router version, the fallback is to render the document shell from `PageView` (which already has `resolved.locale` in hand) instead of from `__root.tsx`. Report which mechanism you used.

- [ ] **Step 11: Verify routing and enumeration in the browser**

```bash
pnpm dev
```

Check each:
1. `/debug` lists 2 URLs for the single page: `/` (mn) and `/en` (en). Four once Task 8 uncomments the contact page.
2. `/` renders hero with Mongolian copy; header shows an `EN` link.
3. `/en` renders hero with English copy; header shows `MN`.
4. Clicking the locale link on `/` lands on `/en` and vice versa — not on `/en/en`.
5. `/nope` returns a 404, not a crash.
6. Both hero CTAs resolve to `#hero` and scroll to the hero section. They target `'hero'` deliberately so every task up to Task 8 has a fully working build; Task 8 repoints the primary CTA at `contact` once that block exists.
7. **Responsive header sweep** in devtools device emulation at 320, 375, 768, 1280 and 1536 px:
   - At 320 and 375: the inline nav is hidden and the `☰` disclosure is shown. Opening it reveals the page links and the locale link in a panel that does not overflow the viewport. The header does not wrap or overlap the site name.
   - At 768 and above: the inline nav is shown and the disclosure is hidden.
   - The disclosure opens and closes **with JavaScript disabled** — that is the reason for using `<details>`, so verify it rather than assuming.
   - No horizontal scrollbar at any width; footer contact links wrap rather than overflow at 320px.

- [ ] **Step 12: Verify lint and types**

```bash
pnpm lint && pnpm typecheck
```

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: add site/pages config, locale routing, link resolution, and chrome"
```

---

### Task 5: SEO head, JSON-LD graph

**Files:**
- Create: `src/shell/seo/build-head.ts`, `src/shell/seo/json-ld.ts`
- Modify: `src/routes/index.tsx`, `src/routes/$.tsx`

**Interfaces:**
- Consumes: `ResolvedPage`, `localePath`, `enumerateUrls` (Task 4); `registry` (Task 3).
- Produces: `buildJsonLd(resolved, site, pages) → JsonLdNode`; `buildHead(resolved, site, pages) → { meta, links, scripts }` shaped for TanStack Router's `head`.

- [ ] **Step 0: Create the referenced public assets**

Three files are referenced by config and markup from this task onward. Nothing creates them, so without this step `og:image`, the JSON-LD `logo`, and the hero image all 404 — and a 404 OG image means no preview card on any social or messaging platform, which is invisible in local testing.

Generate real files, not empty placeholders — an empty file 404s differently but is just as broken:

```bash
mkdir -p public
# 1200x630 is the OG standard aspect; solid colour is fine as a default.
magick -size 1200x630 xc:'#5b5bd6' public/og-default.jpg 2>/dev/null \
  || python3 -c "print('install ImageMagick or supply public/og-default.jpg manually')"
magick -size 1200x900 xc:'#e5e7eb' public/hero.jpg 2>/dev/null || true
cat > public/logo.svg <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="#5b5bd6"/>
  <path d="M20 40V24h6v11h10v5z" fill="#fff"/>
</svg>
SVG
ls -l public/
```

If ImageMagick is unavailable, any real JPEG of roughly those dimensions works — these are placeholders a client project replaces. Confirm all three exist and are non-empty before continuing.

- [ ] **Step 1: Write the JSON-LD assembler**

Create `src/shell/seo/json-ld.ts`:

```ts
import { type BlockId, registry } from '~/blocks/registry'
import type { JsonLdNode, PageConfig, SiteConfig } from '~/shell/types'
import { localePath } from '~/shell/pages/enumerate'
import type { ResolvedPage } from '~/shell/pages/resolve-request'

function organizationNode(site: SiteConfig): JsonLdNode {
  const { organization: org } = site
  const node: JsonLdNode = {
    '@type': org.kind,
    '@id': `${site.url}/#organization`,
    name: org.legalName ?? site.name,
    url: site.url,
    logo: `${site.url}${org.logo}`,
  }
  if (org.email) node.email = org.email
  if (org.phone) node.telephone = org.phone
  if (org.sameAs) node.sameAs = org.sameAs
  if (org.address) {
    node.address = {
      '@type': 'PostalAddress',
      addressCountry: org.address.country,
      addressLocality: org.address.city,
      addressRegion: org.address.region,
      streetAddress: org.address.street,
      postalCode: org.address.postalCode,
    }
  }
  return node
}

export function buildJsonLd(
  resolved: ResolvedPage<BlockId>,
  site: SiteConfig,
  pages: PageConfig<BlockId>[],
): JsonLdNode {
  const { locale, page } = resolved
  const url = `${site.url}${localePath(page.path, locale, site)}`
  const seo = page.seo[locale]

  const graph: JsonLdNode[] = [
    {
      '@type': 'WebSite',
      '@id': `${site.url}/#website`,
      url: site.url,
      name: site.name,
      inLanguage: locale,
      publisher: { '@id': `${site.url}/#organization` },
    },
    organizationNode(site),
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: seo.title,
      description: seo.description,
      inLanguage: locale,
      isPartOf: { '@id': `${site.url}/#website` },
    },
  ]

  if (pages.length > 1) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: pages[0]?.seo[locale].title ?? site.name,
          item: `${site.url}${localePath('/', locale, site)}`,
        },
        ...(page.path === '/'
          ? []
          : [{ '@type': 'ListItem', position: 2, name: seo.title, item: url }]),
      ],
    })
  }

  for (const ref of page.blocks) {
    const id = typeof ref === 'string' ? ref : ref.id
    const manifest = registry[id]
    if (!manifest.schema) continue
    graph.push(...manifest.schema({ copy: manifest.copy[locale], site, page }))
  }

  return { '@context': 'https://schema.org', '@graph': graph }
}
```

- [ ] **Step 2: Write the head builder**

Create `src/shell/seo/build-head.ts`:

```ts
import type { BlockId } from '~/blocks/registry'
import type { PageConfig, SiteConfig } from '~/shell/types'
import { localePath } from '~/shell/pages/enumerate'
import type { ResolvedPage } from '~/shell/pages/resolve-request'
import { buildJsonLd } from './json-ld'

export function buildHead(
  resolved: ResolvedPage<BlockId>,
  site: SiteConfig,
  pages: PageConfig<BlockId>[],
) {
  const { locale, page } = resolved
  const seo = page.seo[locale]
  const canonical = `${site.url}${localePath(page.path, locale, site)}`
  const ogImage = `${site.url}${seo.ogImage ?? site.ogImageDefault}`
  // One separator for every page, so titles stay visually consistent across the site.
  const title = `${seo.title} · ${site.name}`

  const alternates = site.locales.map((l) => ({
    rel: 'alternate',
    hrefLang: l,
    href: `${site.url}${localePath(page.path, l, site)}`,
  }))

  return {
    meta: [
      { title },
      { name: 'description', content: seo.description },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: seo.description },
      { property: 'og:url', content: canonical },
      { property: 'og:image', content: ogImage },
      { property: 'og:locale', content: locale },
      { property: 'og:site_name', content: site.name },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: seo.description },
      { name: 'twitter:image', content: ogImage },
    ],
    links: [
      { rel: 'canonical', href: canonical },
      ...alternates,
      {
        rel: 'alternate',
        hrefLang: 'x-default',
        href: `${site.url}${localePath(page.path, site.defaultLocale, site)}`,
      },
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify(buildJsonLd(resolved, site, pages)),
      },
    ],
  }
}
```

- [ ] **Step 3: Wire `head()` into both routes**

In `src/routes/index.tsx` and `src/routes/$.tsx`, add `head` alongside the existing `loader`. `head()` receives no pathname, which is exactly why the loader resolves the page first:

```tsx
export const Route = createFileRoute('/')({
  loader: () => {
    const resolved = resolveRequest('/', pages, site)
    if (!resolved) throw notFound()
    return resolved
  },
  head: ({ loaderData }) => (loaderData ? buildHead(loaderData, site, pages) : {}),
  component: () => <PageView resolved={Route.useLoaderData()} />,
})
```

Add the import: `import { buildHead } from '~/shell/seo/build-head'`.

- [ ] **Step 4: Verify the emitted head in the browser**

```bash
pnpm dev
```

On `/`, use View Source (not the devtools element inspector — you need the server-rendered markup) and confirm:
1. `<title>` contains both the page title and the site name.
2. Exactly one `<link rel="canonical">`, absolute, ending in the site origin with no locale prefix.
3. Three `<link rel="alternate">` tags: `hrefLang="mn"`, `hrefLang="en"`, `hrefLang="x-default"`.
4. A `<script type="application/ld+json">` whose contents parse as JSON and contain `WebSite`, the organization type, and `WebPage`.

On `/en`, confirm the canonical is `.../en` and `og:locale` is `en`.

**If the JSON-LD script tag is absent**, TanStack's `head.scripts` does not support inline `children` in this version. Fall back to rendering it from `PageView` with React 19's native hoisting:
```tsx
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(resolved, site, pages)) }} />
```
Verify again by View Source before moving on. Task 6 asserts this mechanically, so do not defer the decision.

- [ ] **Step 5: Verify lint and types**

```bash
pnpm lint && pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add SEO head builder and JSON-LD graph assembly"
```

---

### Task 6: Prerendering, sitemap, robots, verify-build

**Files:**
- Create: `src/shell/seo/emit-plugin.ts`, `scripts/verify-build.mjs`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: `enumerateUrls` (Task 4), `pages`, `site`.
- Produces: prerendered HTML in the build output; `dist/sitemap.xml`; `dist/robots.txt`; `.kit/urls.json` as the manifest `verify-build.mjs` reads.

- [ ] **Step 1: Write the emit plugin**

Create `src/shell/seo/emit-plugin.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'
// Relative, NOT `~/` — see the note below this code block.
import { enumerateUrls } from '../pages/enumerate'
import type { PageConfig, SiteConfig } from '../types'

export function emitSeoFiles({
  pages,
  site,
  outDir,
}: {
  pages: PageConfig[]
  site: SiteConfig
  outDir: string
}): Plugin {
  return {
    name: 'kit:emit-seo-files',
    apply: 'build',
    closeBundle() {
      const urls = enumerateUrls(pages, site)

      const entries = urls
        .map((u) => {
          const alternates = site.locales
            .map((l) => {
              const alt = urls.find((x) => x.pageId === u.pageId && x.locale === l)
              return alt
                ? `    <xhtml:link rel="alternate" hreflang="${l}" href="${site.url}${alt.path}"/>`
                : ''
            })
            .filter(Boolean)
            .join('\n')
          return `  <url>\n    <loc>${site.url}${u.path}</loc>\n${alternates}\n  </url>`
        })
        .join('\n')

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`

      const robots = `User-agent: *\nAllow: /\nDisallow: /debug\n\nSitemap: ${site.url}/sitemap.xml\n`

      const write = (p: string, body: string) => {
        mkdirSync(dirname(p), { recursive: true })
        writeFileSync(p, body, 'utf8')
      }

      write(join(outDir, 'sitemap.xml'), sitemap)
      write(join(outDir, 'robots.txt'), robots)
      write('.kit/urls.json', JSON.stringify({ site: site.url, outDir, urls }, null, 2))
    },
  }
}
```

**Why relative imports here, uniquely in this codebase:** this module is imported *by*
`vite.config.ts`, and the `~/*` alias is defined *inside* that config — so it does not exist
yet while the config is being loaded. Vite bundles the config with esbuild before any
`resolve.alias` applies, and tsconfig `paths` are not honoured there either.

`import type` lines are safe with `~/` even in this position, because esbuild erases them
before resolution ever happens — which is why `pages.config.ts` and `site.config.ts` may keep
their `~/` type imports. Only **runtime** imports reachable from `vite.config.ts` must be
relative. That is exactly: `emit-plugin.ts`, and anything it imports at runtime
(`pages/enumerate.ts` — which imports types only, so it needs no change).

If `pnpm build` fails with a resolution error mentioning `~/shell/...`, this is the cause.

- [ ] **Step 2: Wire prerendering and the plugin into Vite**

Modify `vite.config.ts`. Determine the build output directory first:

```bash
pnpm build && find . -name 'index.html' -not -path './node_modules/*' | head
```

Use the directory that contains the client HTML as `OUT_DIR` below (commonly `dist/client` or `.output/public` depending on adapter).

```ts
import { pages } from './src/config/pages.config'
import { site } from './src/config/site.config'
import { enumerateUrls } from './src/shell/pages/enumerate'
import { emitSeoFiles } from './src/shell/seo/emit-plugin'

const OUT_DIR = 'dist/client'

export default defineConfig({
  resolve: { /* aliases from Task 1, unchanged */ },
  plugins: [
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
        concurrency: 8,
      },
      pages: enumerateUrls(pages, site).map((u) => ({
        path: u.path,
        prerender: { enabled: true, outputPath: u.outputPath },
      })),
    }),
    emitSeoFiles({ pages, site, outDir: OUT_DIR }),
  ],
})
```

`autoStaticPathsDiscovery: false` plus `crawlLinks: false` is deliberate: only the enumerated pages × locales prerender, which keeps `/debug` out of the output. `failOnError: true` means a throwing `resolve()` fails the build rather than emitting a broken page.

Note that `closeBundle` may fire more than once, because TanStack Start runs separate client and server builds. The plugin writes the same three files from the same inputs each time, so repeat execution is harmless — but do not make it append, and do not assume it runs exactly once.

If the plugin rejects `pages` as a sibling of `prerender`, move it inside the `prerender` object — the docs show `pages` at the config level, so verify against `pnpm build` output and use whichever the installed version accepts.

- [ ] **Step 3: Write the verification script**

Create `scripts/verify-build.mjs`. Zero dependencies; regex parsing is acceptable because it only ever reads markup this project generated.

```js
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const manifest = JSON.parse(readFileSync('.kit/urls.json', 'utf8'))
const { site, outDir, urls } = manifest
const failures = []
const fail = (where, msg) => failures.push(`${where}: ${msg}`)

// --- registry / folder parity -------------------------------------------------
const blocksDir = 'src/blocks'
const registrySrc = readFileSync(join(blocksDir, 'registry.ts'), 'utf8')
for (const entry of readdirSync(blocksDir)) {
  if (!statSync(join(blocksDir, entry)).isDirectory()) continue
  if (!new RegExp(`\\b${entry}\\b`).test(registrySrc)) {
    fail('registry', `block folder '${entry}' has no registry entry`)
  }
}

// --- per-page HTML assertions -------------------------------------------------
const titles = new Map()

for (const u of urls) {
  const file = join(outDir, u.outputPath)
  if (!existsSync(file)) {
    fail(u.path, `missing prerendered file ${file}`)
    continue
  }
  const html = readFileSync(file, 'utf8')
  const expected = `${site}${u.path}`

  const h1s = html.match(/<h1[\s>]/g) ?? []
  if (h1s.length !== 1) fail(u.path, `expected exactly 1 <h1>, found ${h1s.length}`)

  const lang = html.match(/<html[^>]*\blang="([^"]+)"/)?.[1]
  if (lang !== u.locale) fail(u.path, `<html lang> is '${lang}', expected '${u.locale}'`)

  const canonicals = [...html.matchAll(/<link[^>]*rel="canonical"[^>]*>/g)]
  if (canonicals.length !== 1) {
    fail(u.path, `expected exactly 1 canonical, found ${canonicals.length}`)
  } else {
    const href = canonicals[0][0].match(/href="([^"]+)"/)?.[1]
    if (href !== expected) fail(u.path, `canonical is '${href}', expected '${expected}'`)
  }

  const hreflangs = new Set(
    [...html.matchAll(/<link[^>]*rel="alternate"[^>]*hreflang="([^"]+)"/g)].map((m) => m[1]),
  )
  for (const need of ['mn', 'en', 'x-default']) {
    if (!hreflangs.has(need)) fail(u.path, `missing hreflang '${need}'`)
  }

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim()
  if (!title) fail(u.path, 'empty or missing <title>')
  else {
    if (titles.has(title)) fail(u.path, `duplicate <title> shared with ${titles.get(title)}`)
    titles.set(title, u.path)
  }

  const desc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/)?.[1]?.trim()
  if (!desc) fail(u.path, 'empty or missing meta description')

  const ld = html.match(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
  )?.[1]
  if (!ld) fail(u.path, 'missing JSON-LD script')
  else {
    try {
      const graph = JSON.parse(ld)['@graph'] ?? []
      const types = new Set(graph.map((n) => n['@type']))
      for (const need of ['WebSite', 'WebPage']) {
        if (!types.has(need)) fail(u.path, `JSON-LD missing @type '${need}'`)
      }
      if (!types.has('Organization') && !types.has('LocalBusiness')) {
        fail(u.path, 'JSON-LD missing Organization or LocalBusiness')
      }
    } catch (e) {
      fail(u.path, `JSON-LD does not parse: ${e.message}`)
    }
  }
}

// --- generated files ----------------------------------------------------------
const sitemapPath = join(outDir, 'sitemap.xml')
if (!existsSync(sitemapPath)) fail('sitemap.xml', 'not emitted')
else {
  const xml = readFileSync(sitemapPath, 'utf8')
  for (const u of urls) {
    if (!xml.includes(`<loc>${site}${u.path}</loc>`)) fail('sitemap.xml', `missing ${u.path}`)
  }
}
if (!existsSync(join(outDir, 'robots.txt'))) fail('robots.txt', 'not emitted')

// --- debug route must not ship ------------------------------------------------
if (existsSync(join(outDir, 'debug/index.html'))) {
  fail('/debug', 'debug route was prerendered; it must be excluded')
}

if (failures.length) {
  console.error(`\n✗ verify-build: ${failures.length} failure(s)\n`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ verify-build: ${urls.length} page(s) passed`)
```

- [ ] **Step 4: Build and run verification**

```bash
pnpm build && node scripts/verify-build.mjs
```

Expected on first run: **failures**. Work through them one at a time — the likely ones are a wrong `OUT_DIR`, `<html lang>` still hardcoded from Task 4 Step 10, and a missing JSON-LD tag if `head.scripts` did not support inline children. Each failure names the page and the exact problem.

- [ ] **Step 5: Re-run until clean**

```bash
pnpm build && node scripts/verify-build.mjs
```

Expected: `✓ verify-build: 2 page(s) passed`.

- [ ] **Step 6: Inspect the generated files by eye**

```bash
cat dist/client/sitemap.xml dist/client/robots.txt
```

Expected: two `<url>` entries, each with `xhtml:link` alternates for `mn` and `en`; `robots.txt` disallowing `/debug` and pointing at the sitemap.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add prerendering, sitemap/robots emission, and build verification"
```

---

### Task 7: Motion boundary, theme modes, convention checks

**Files:**
- Create: `src/motion.animated.tsx`, `src/motion.noop.tsx`, `src/shell/theme/theme-script.ts`, `src/shell/theme/theme-toggle.tsx`, `scripts/check-conventions.mjs`
- Modify: `src/routes/__root.tsx`, `src/shell/chrome/header.tsx`, `src/blocks/hero/hero-centered.tsx`, `src/blocks/hero/hero-split.tsx`

**Interfaces:**
- Consumes: `site.theme` (Task 4).
- Produces: `~/motion` exporting `FadeIn`, `Stagger`, `Reveal` with identical signatures in both implementations; `themeScript(defaultMode)`; `<ThemeToggle>`.

- [ ] **Step 1: Write the animated implementation**

Create `src/motion.animated.tsx`. Only `transform` and `opacity` are animated, and `useReducedMotion` is honoured in one place.

```tsx
import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

type Props = { children: ReactNode; className?: string; delay?: number }

export function FadeIn({ children, className, delay = 0 }: Props) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

export function Reveal({ children, className, delay = 0 }: Props) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.2 }}
      variants={{ shown: { transition: { staggerChildren: 0.08 } } }}
    >
      {children}
    </motion.div>
  )
}
```

- [ ] **Step 2: Write the no-op implementation with the identical surface**

Create `src/motion.noop.tsx`:

```tsx
import type { ReactNode } from 'react'

type Props = { children: ReactNode; className?: string; delay?: number }

export function FadeIn({ children, className }: Props) {
  return <div className={className}>{children}</div>
}

export function Reveal({ children, className }: Props) {
  return <div className={className}>{children}</div>
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}
```

- [ ] **Step 3: Use the presets in both hero variants**

In `hero-centered.tsx`, wrap the text group in `<FadeIn>` and the button row in `<FadeIn delay={0.1}>`. In `hero-split.tsx`, wrap the text column in `<FadeIn>` and the image in `<Reveal>`. Import from `~/motion` only:

```tsx
import { FadeIn, Reveal } from '~/motion'
```

- [ ] **Step 4: Write the no-flash theme script**

Create `src/shell/theme/theme-script.ts`. This runs before first paint; without it a prerendered dark-mode visit flashes white.

```ts
export function themeScript(defaultMode: 'light' | 'dark'): string {
  return `(function(){try{var s=localStorage.getItem('kit-theme');var m=s||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')||'${defaultMode}';if(m==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`
}
```

- [ ] **Step 5: Write the toggle**

Create `src/shell/theme/theme-toggle.tsx`:

```tsx
import { useEffect, useState } from 'react'

export function ThemeToggle({ label }: { label: string }) {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('kit-theme', next ? 'dark' : 'light')
    } catch {}
  }

  return (
    <button type="button" onClick={toggle} aria-label={label} className="text-sm">
      {dark ? '☀' : '☾'}
    </button>
  )
}
```

- [ ] **Step 6: Mount both behind the mode check**

In `src/routes/__root.tsx`, inject the script in `<head>` only when `site.theme.mode === 'both'`:

```tsx
{site.theme.mode === 'both' ? (
  <script dangerouslySetInnerHTML={{ __html: themeScript(site.theme.default ?? 'light') }} />
) : null}
```

In `src/shell/chrome/header.tsx`, render `<ThemeToggle label={locale === 'mn' ? 'Өнгө хувиргах' : 'Toggle theme'} />` under the same condition. Single-mode builds must emit neither.

- [ ] **Step 7: Write the convention checker**

Create `scripts/check-conventions.mjs`. This covers what Biome cannot: Tailwind class strings and raw elements.

Note what the rules deliberately do **not** forbid: ordinary small padding like `py-3` on a button or input. Blocks are allowed to style their own components — what they may not do is set the *section's* rhythm (`py-section`), the *page's* gutter (`px-gutter`) or measure (`max-w-*`), assume viewport height, or reach past the token layer with arbitrary values and inline styles. An earlier draft of this rule banned `py-*` outright, which would have failed the contact form's perfectly legitimate `py-3` inputs.

The `style={{` rule enforces Tailwind-first mechanically. If a block ever needs a genuinely dynamic value that cannot be a class, that is the moment to add a narrow exception with a comment explaining it — not to weaken the rule pre-emptively.

```js
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RULES = [
  { re: /\bpy-section\b/, msg: 'py-section belongs to <Section>, not to a block' },
  { re: /\bpx-gutter\b/, msg: 'px-gutter belongs to <Container>, not to a block' },
  { re: /className="[^"]*\bmax-w-/, msg: 'max-width utility — use <Container width="narrow">' },
  { re: /className="[^"]*\bcontainer\b/, msg: 'container utility — use <Container>' },
  { re: /<section[\s>]/, msg: 'raw <section> element — use <Section>' },
  { re: /\bmin-h-screen\b/, msg: 'min-h-screen — blocks must not assume viewport height' },
  { re: /\btext-\[length:/, msg: 'arbitrary font-size — use text-display/h2/h3/lead' },
  { re: /\brounded-\[/, msg: 'arbitrary radius — use rounded-base' },
  { re: /style=\{\{/, msg: 'inline style — use a Tailwind utility from the token layer' },
]

const failures = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.tsx')) check(p)
  }
}

function check(file) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.re.test(line)) failures.push(`${file}:${i + 1}  ${rule.msg}`)
    }
  })
}

walk('src/blocks')

if (failures.length) {
  console.error(`\n✗ check-conventions: ${failures.length} violation(s)\n`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('✓ check-conventions: blocks follow layout primitives')
```

- [ ] **Step 8: Verify the checker catches a real violation**

```bash
node scripts/check-conventions.mjs
```

Expected: pass. Now add `className="max-w-3xl"` to a div in `hero-centered.tsx` and re-run. Expected: FAIL naming that file and line. Remove it and re-run — expected: pass.

Then confirm the rule is not over-broad: temporarily add `className="py-3"` to the same div and re-run. Expected: **pass** — component-level padding is legitimate. Remove it.

- [ ] **Step 9: Verify the animated build and the theme toggle**

```bash
pnpm dev
```

1. Hero content fades in on load; the split image reveals on scroll.
2. The theme toggle switches palettes and persists across a hard reload.
3. With the page in dark mode, reload and watch closely — **no white flash**.
4. In devtools, enable "Emulate prefers-reduced-motion: reduce" and reload — content appears immediately, fully legible, no animation.

- [ ] **Step 10: Verify the no-animation build**

```bash
KIT_ANIMATION=off pnpm build && node scripts/verify-build.mjs
```

Expected: verification passes. Then confirm `motion` is genuinely absent from the client bundle:

```bash
grep -rl 'framer\|motion-dom' dist/client/assets/ | head
```

Expected: no output. If `motion` still appears, the alias is not taking effect — fix before committing, since the whole animation-off option rests on it.

- [ ] **Step 11: Verify lint, types, conventions**

```bash
pnpm lint && pnpm typecheck && pnpm conventions
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: add motion boundary, theme modes with no-flash script, convention checks"
```

---

### Task 8: Contact block and the submission boundary

**Files:**
- Create: `src/submit-schema.ts`, `src/submit.endpoint.ts`, `src/submit.server.ts`, `src/blocks/contact/manifest.ts`, `src/blocks/contact/contact-form.tsx`, `src/blocks/contact/copy.mn.ts`, `src/blocks/contact/copy.en.ts`, `src/blocks/contact/schema.ts`
- Modify: `src/blocks/registry.ts`, `src/config/pages.config.ts`

**Interfaces:**
- Consumes: the block contract (Task 3); `<Section>`, `<Container>` (Task 2).
- Produces: `contactSchema` (zod); `submitContact(input) → Promise<{ ok: true } | { ok: false; error: string }>` from `~/submit`; the `contact` block registered and placed on the `/contact` page.

- [ ] **Step 1: Write the shared schema**

Create `src/submit-schema.ts`. Both implementations and the form import this one schema, so client and server validation cannot diverge.

```ts
import { z } from 'zod'

export const contactSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.email(),
  message: z.string().min(10).max(4000),
  /** Honeypot — must stay empty. */
  company: z.string().max(0).optional().default(''),
  /** Milliseconds the form was on screen before submit. */
  elapsedMs: z.number().int().min(2000),
})

export type ContactInput = z.infer<typeof contactSchema>
export type SubmitResult = { ok: true } | { ok: false; error: string }
```

The honeypot and the 2-second minimum are the spam handling — no CAPTCHA, per the spec.

- [ ] **Step 2: Write the static-deploy implementation**

Create `src/submit.endpoint.ts`:

```ts
import { contactSchema, type ContactInput, type SubmitResult } from '~/submit-schema'

export async function submitContact(input: ContactInput): Promise<SubmitResult> {
  const parsed = contactSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const endpoint = import.meta.env.VITE_CONTACT_ENDPOINT
  if (!endpoint) return { ok: false, error: 'missing-endpoint' }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: parsed.data.name,
        email: parsed.data.email,
        message: parsed.data.message,
      }),
    })
    return res.ok ? { ok: true } : { ok: false, error: `http-${res.status}` }
  } catch {
    return { ok: false, error: 'network' }
  }
}
```

- [ ] **Step 3: Write the SSR implementation**

Create `src/submit.server.ts`. It revalidates server-side because the client can be bypassed.

```ts
import { createServerFn } from '@tanstack/react-start'
import { contactSchema, type ContactInput, type SubmitResult } from '~/submit-schema'

const handler = createServerFn({ method: 'POST' })
  .validator((data: unknown) => contactSchema.parse(data))
  .handler(async ({ data }): Promise<SubmitResult> => {
    console.log('[contact]', data.name, data.email)
    // Wire an email provider here per project.
    return { ok: true }
  })

export async function submitContact(input: ContactInput): Promise<SubmitResult> {
  try {
    return await handler({ data: input })
  } catch {
    return { ok: false, error: 'server' }
  }
}
```

If `createServerFn`'s builder API differs in 1.168, adjust to the installed signature — the exported `submitContact` signature must stay identical to the endpoint version, because that identity is the whole point of the boundary.

- [ ] **Step 4: Write the copy**

Create `src/blocks/contact/copy.mn.ts`:

```ts
export const mn = {
  navLabel: 'Холбоо барих',
  heading: 'Бидэнтэй холбогдоно уу',
  lead: 'Хүсэлтээ илгээгээрэй, бид ажлын өдөрт хариу барина.',
  fields: { name: 'Нэр', email: 'И-мэйл', message: 'Захидал' },
  submit: 'Илгээх',
  submitting: 'Илгээж байна…',
  success: 'Баярлалаа! Бид тантай холбогдоно.',
  error: 'Илгээхэд алдаа гарлаа. Дахин оролдоно уу.',
  validation: 'Бүх талбарыг зөв бөглөнө үү.',
}

export type ContactCopy = typeof mn
```

Create `src/blocks/contact/copy.en.ts`:

```ts
import type { ContactCopy } from './copy.mn'

export const en: ContactCopy = {
  navLabel: 'Contact',
  heading: 'Get in touch',
  lead: 'Send us a message and we will reply within one business day.',
  fields: { name: 'Name', email: 'Email', message: 'Message' },
  submit: 'Send',
  submitting: 'Sending…',
  success: 'Thank you! We will be in touch.',
  error: 'Something went wrong. Please try again.',
  validation: 'Please complete every field correctly.',
}
```

- [ ] **Step 5: Write the form**

Create `src/blocks/contact/contact-form.tsx`:

```tsx
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'
import { submitContact } from '~/submit'
import { contactSchema } from '~/submit-schema'
import type { BlockProps, Surface } from '~/shell/types'
import type { ContactCopy } from './copy.mn'

type Fields = { name: string; email: string; message: string; company: string }

export function ContactForm({ copy, surface, anchorId }: BlockProps<ContactCopy>) {
  const { register, handleSubmit, reset } = useForm<Fields>()
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const mountedAt = useRef(Date.now())

  async function onSubmit(values: Fields) {
    const parsed = contactSchema.safeParse({
      ...values,
      elapsedMs: Date.now() - mountedAt.current,
    })
    if (!parsed.success) {
      setState('error')
      setMessage(copy.validation)
      return
    }
    setState('sending')
    const result = await submitContact(parsed.data)
    if (result.ok) {
      setState('sent')
      setMessage(copy.success)
      reset()
    } else {
      setState('error')
      setMessage(copy.error)
    }
  }

  const field = 'border-border bg-background w-full rounded-base min-h-11 border px-4 py-3'

  return (
    <Section id={anchorId} surface={surface}>
      <Container width="narrow">
        <h2 className="text-h2 font-semibold">{copy.heading}</h2>
        <p className="text-muted-foreground mt-3 text-lead">{copy.lead}</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium">{copy.fields.name}</span>
            <input className={field} autoComplete="name" {...register('name')} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{copy.fields.email}</span>
            <input className={field} type="email" autoComplete="email" {...register('email')} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{copy.fields.message}</span>
            <textarea className={field} rows={5} {...register('message')} />
          </label>

          <div aria-hidden="true" className="absolute -left-[9999px]">
            <input tabIndex={-1} autoComplete="off" {...register('company')} />
          </div>

          <button
            type="submit"
            disabled={state === 'sending'}
            className="bg-primary text-primary-foreground rounded-base min-h-11 px-6 py-3 font-medium disabled:opacity-60"
          >
            {state === 'sending' ? copy.submitting : copy.submit}
          </button>

          {message ? (
            <p
              role="status"
              className={state === 'error' ? 'text-sm text-red-600' : 'text-sm text-green-700'}
            >
              {message}
            </p>
          ) : null}
        </form>
      </Container>
    </Section>
  )
}
```

The form's readable measure comes from `<Container width="narrow">`, not a `max-w-*` class and not an inline style. That is why `Container` has a `width` prop: a block that needs a narrower column asks the primitive for one, so the "no `max-w-*` in blocks" rule stays absolute with no exception list, and the width still comes from the preset rather than a hardcoded number.

Note also that `Surface` is not imported here — `surface` arrives through `BlockProps`.

Verify responsively at 320, 375, 768 and 1280 px: labels and inputs stack in one column at every width, no input overflows the gutter, and every input, the textarea and the submit button are at least 44px tall.

- [ ] **Step 6: Write the schema contribution and manifest**

Create `src/blocks/contact/schema.ts`:

```ts
import type { BlockSchema } from '~/shell/types'
import type { ContactCopy } from './copy.mn'

export const schema: BlockSchema<ContactCopy> = ({ copy, site }) => [
  {
    '@type': 'ContactPage',
    name: copy.heading,
    description: copy.lead,
    isPartOf: { '@id': `${site.url}/#website` },
  },
]
```

Create `src/blocks/contact/manifest.ts`:

```ts
import type { BlockManifest } from '~/shell/types'
import { ContactForm } from './contact-form'
import { en } from './copy.en'
import { type ContactCopy, mn } from './copy.mn'
import { schema } from './schema'

export const contact = {
  id: 'contact',
  variants: { default: ContactForm },
  defaultVariant: 'default',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  schema,
  requires: { npm: ['react-hook-form', 'zod'], ui: [] },
} satisfies BlockManifest<ContactCopy, 'default'>
```

- [ ] **Step 7: Register the block and enable the page**

Three edits, and they must land together — the resolver throws on a target that matches no page and no placed block, so a half-done registration breaks every page render:

1. `src/blocks/registry.ts` — import `contact` and add it to the map.
2. `src/config/pages.config.ts` — remove the `// TASK 8: uncomment` marker and enable the `/contact` page.
3. `src/config/site.config.ts` — add `{ target: 'contact' }` to `nav`, which Task 4 deliberately left out.

- [ ] **Step 7b: Repoint the hero's primary CTA at the contact block**

Until now both hero CTAs targeted `'hero'` so every task had a working build. Now that `contact` exists, change `primaryCta.target` from `'hero'` to `'contact'` in **both** `src/blocks/hero/copy.mn.ts` and `src/blocks/hero/copy.en.ts`. Leave `secondaryCta` on `'hero'`.

This is the link resolver's whole purpose: the same copy change makes the CTA a page link (`/contact`) in the multi-page config and an anchor (`#contact`) in the one-page config, with no block edit.

- [ ] **Step 8: Verify the hero CTA now resolves**

```bash
pnpm dev
```

1. On `/`, the primary CTA links to `/contact` (a page link, since `contact` lives on its own page) — not `#contact`.
2. On `/en`, it links to `/en/contact`.
3. `/contact` renders the form in Mongolian; `/en/contact` in English.

- [ ] **Step 9: Verify form behaviour in the endpoint build**

With no `VITE_CONTACT_ENDPOINT` set, submit a valid message. Expected: the error message renders (`missing-endpoint` path) — proving the failure path surfaces to the user rather than failing silently. Then submit immediately after reload with fewer than 2 seconds elapsed. Expected: the validation message, from the timing check.

- [ ] **Step 10: Verify the server build compiles and swaps**

```bash
KIT_SUBMIT=server pnpm build && node scripts/verify-build.mjs
```

Expected: build succeeds and verification passes with 4 pages.

- [ ] **Step 11: Full verification**

```bash
pnpm verify
```

Expected: lint, typecheck, conventions, build, and `✓ verify-build: 4 page(s) passed`.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: add contact block and swappable submission boundary"
```

---

### Task 9: One-page smoke config and Lighthouse budget

**Files:**
- Create: `configs/smoke-onepage/pages.config.ts`, `configs/smoke-onepage/site.config.ts`, `lighthouserc.json`
- Modify: `package.json`, `README.md`

**Interfaces:**
- Consumes: the `~/config` alias (Task 1); `KIT_ANIMATION`, `KIT_SUBMIT` (Task 7, Task 8).
- Produces: `pnpm smoke:onepage`, `pnpm smoke:full`, `pnpm lighthouse`.

- [ ] **Step 1: Write the one-page config**

Create `configs/smoke-onepage/pages.config.ts`. One page holding both blocks, so anchor resolution is exercised instead of page links:

```ts
import type { BlockId } from '~/blocks/registry'
import type { PageConfig } from '~/shell/types'

export const pages: PageConfig<BlockId>[] = [
  {
    id: 'home',
    path: '/',
    blocks: [{ id: 'hero', variant: 'split' }, 'contact'],
    seo: {
      mn: { title: 'Эхлэл', description: 'Нэг хуудсан вэб.' },
      en: { title: 'Home', description: 'Single page site.' },
    },
  },
]
```

Create `configs/smoke-onepage/site.config.ts` — same as `src/config/site.config.ts` but light-only, so this smoke covers a single-mode theme too:

```ts
import type { SiteConfig } from '~/shell/types'

export const site = {
  name: 'Landing Kit',
  url: 'https://example.mn',
  defaultLocale: 'mn',
  locales: ['mn', 'en'],
  organization: { kind: 'Organization', legalName: 'Landing Kit LLC', logo: '/logo.svg' },
  nav: [{ target: 'hero' }, { target: 'contact' }],
  theme: { mode: 'light' },
} satisfies SiteConfig
```

The `~/config` alias points at a *directory*, so both files must be importable as `~/config/pages.config` and `~/config/site.config`. Confirm the alias resolves to the directory and not a single file; adjust Task 1's alias to `~/config` → directory path if imports fail.

- [ ] **Step 2: Add the smoke scripts**

Add to `package.json`:

```json
{
  "scripts": {
    "smoke:full": "KIT_CONFIG=default KIT_ANIMATION=on KIT_SUBMIT=server vite build && node scripts/verify-build.mjs",
    "smoke:onepage": "KIT_CONFIG=onepage KIT_ANIMATION=off KIT_SUBMIT=endpoint vite build && node scripts/verify-build.mjs",
    "lighthouse": "lhci autorun",
    "lighthouse:desktop": "lhci autorun --collect.settings.preset=desktop"
  }
}
```

- [ ] **Step 3: Run the one-page smoke**

```bash
pnpm smoke:onepage
```

Expected: `✓ verify-build: 2 page(s) passed`. Then confirm the boundaries actually swapped:

```bash
grep -rl 'motion-dom\|framer' dist/client/assets/ | head
grep -c 'kit-theme' dist/client/index.html
```

Expected: no motion output; `0` occurrences of `kit-theme` (light-only builds must ship no theme script). If either fails, the mode flags are not wired — fix before continuing, since this smoke is the only thing protecting the CLI's core assumption.

- [ ] **Step 4: Verify anchors in one-page mode**

```bash
KIT_CONFIG=onepage KIT_ANIMATION=off pnpm dev
```

Expected: `/` shows hero and contact stacked; the hero CTA is now `#contact` (an anchor, not `/contact`) and clicking it scrolls. This is the link resolver switching behaviour with zero block changes — the central claim of the design.

- [ ] **Step 5: Run the full smoke**

```bash
pnpm smoke:full
```

Expected: `✓ verify-build: 4 page(s) passed`.

- [ ] **Step 6: Add the Lighthouse budget**

```bash
pnpm add -D @lhci/cli
```

Create `lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "staticDistDir": "dist/client",
      "url": ["http://localhost/index.html", "http://localhost/en/index.html"],
      "numberOfRuns": 2
    },
    "assert": {
      "assertions": {
        "categories:seo": ["error", { "minScore": 1 }],
        "categories:performance": ["error", { "minScore": 0.95 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.01 }]
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

- [ ] **Step 7: Run Lighthouse and fix what it finds**

```bash
pnpm build && pnpm lighthouse && pnpm lighthouse:desktop
```

Lighthouse CI's default preset is **mobile** with CPU and network throttling, so `pnpm lighthouse` is the harder, more representative run for these sites; `lighthouse:desktop` catches desktop-only layout and contrast regressions. Both must pass the same budget.

Expected: all four assertions pass on both presets. Common first failures and their fixes:
- **Contrast** on `text-muted-foreground` — raise the lightness delta in `aurora.css` for the failing palette.
- **Missing OG image** producing a 404 — add a real `public/og-default.jpg` and `public/hero.jpg`.
- **No `<meta name="theme-color">`** — add one to `__root.tsx` per palette.

Fix rather than relax the thresholds; the budget existing to be demonstrable to clients is the point.

- [ ] **Step 8: Write the README**

Replace `README.md` with the operating manual a second developer needs: the `pnpm` scripts and what each verifies; how to add a block (copy folder → edit `id`/component/copy → add one registry line → add the id to a page); how to add a variant; the token surface and how to reskin via `src/styles/presets/`; the Cyrillic font requirement; and the three env flags (`KIT_CONFIG`, `KIT_ANIMATION`, `KIT_SUBMIT`) with their values.

- [ ] **Step 9: Full verification**

```bash
pnpm verify && pnpm smoke:onepage && pnpm smoke:full && pnpm lighthouse && pnpm lighthouse:desktop
```

Expected: every command exits 0.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add one-page smoke config, Lighthouse budget, and README"
```

---

## Self-Review

**Spec coverage.** Walked every spec section against the tasks:

| Spec section | Covered by |
|---|---|
| §3 Repository layout | Tasks 1–8 create the tree; `configs/` added in Task 9 |
| §4 Block contract, registry, copy parity, schema fn | Task 3 (parity and `defaultVariant` proven by deliberate failing typechecks) |
| §5 Pages, nav, link resolution, splat routing | Task 4 |
| §6 head, JSON-LD, sitemap/robots, fonts, CWV | Tasks 2, 5, 6, 9 |
| §7 Theme / motion / submit boundaries | Tasks 7, 8 |
| §8 Visual design system | Task 2 (tokens, primitives, type scale, Cyrillic), Task 3 (variants), Task 7 (`~/motion`) |
| §9 v1 scope | **Partial by design** — `hero` (2 of 3 variants) and `contact` only |
| §10 Tooling and pins | Task 1 |
| §11 Verification | Tasks 6, 7, 9 |
| §12 CLI forward compatibility | No task; the manifests and env flags this plan builds *are* the compatibility surface |

**Deliberate deferrals to Plan 2** — none of these are gaps in this plan, but all are spec requirements not yet met:
- `hero`'s `screenshot` variant; the `logos`, `features`, `testimonials`, `pricing`, `faq`, `cta` blocks and their variants.
- Token presets 2 and 3 (only `aurora` exists).
- The `/variants` showcase page.
- Automatic surface alternation is implemented but barely exercised with two blocks.

**Spec amendment required.** §8 states a Biome rule restricts spacing utilities inside `src/blocks/`. Biome cannot lint Tailwind class strings, so Task 7 implements this as `scripts/check-conventions.mjs` instead. Update §8 when Plan 1 completes.

**Type consistency.** Checked names across tasks: `BlockProps` gains `surface` in Task 3 Step 10 and is consumed with that shape in Tasks 3 and 8. `localePath`, `enumerateUrls`, `resolveRequest`, `createResolver`, `buildHead`, `buildJsonLd`, `submitContact`, `contactSchema`, `themeScript` are each defined once and referenced with matching signatures. `PageUrl.outputPath` is produced in Task 4 and consumed in Tasks 6 and 9. `registry` / `BlockId` are defined in Task 3 and extended in Task 8.

**Known-unstable API surfaces** where the plan tells the implementer to verify against the installed version rather than trusting a guessed signature: Biome's rule group for `noRestrictedImports` (Task 1 Step 6), `head.scripts` inline `children` for JSON-LD (Task 5 Step 4), `prerender.pages` placement in the plugin config (Task 6 Step 2), the build output directory (Task 6 Step 2), `createServerFn`'s builder shape (Task 8 Step 3), and the generated splat route id (Task 4 Step 8).
