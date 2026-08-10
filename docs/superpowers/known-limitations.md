# Known limitations and Plan 2 carry-forward

Everything here was found during the foundation build and deliberately left in place, with a
reason. Nothing in this file is a surprise or an oversight — it is the list of things a future
change should know about before touching the surrounding code.

## Resolved: pre-hydration block imports

Was open through Task 3 as "Mongolian mobile Performance is 0.90 against a 0.95 target." Fixed in
Task 4. See the README's *Lighthouse budget* section for current numbers; the target itself also
changed — the budget is now mobile ≥ 0.85 / desktop ≥ 0.95, both hard `error`, not a single 0.95
target with a `warn` relaxation.

Two causes were diagnosed, one inherent and one not:

- **Inherent, still true.** A bilingual page loads two font subsets. The chrome carries Latin
  text — brand name, email, phone — while the content is Cyrillic, so `unicode-range` correctly
  fetches both, roughly twice the English page's font payload. The Mongolian page will always be
  the harder one.
- **Not inherent — fixed.** Blocks were eagerly bundled into one ~559 KB chunk that every page
  loaded, so the home page downloaded the contact form's `react-hook-form` and `zod` (99 KB raw /
  30 KB gzip) without a form on it. Lighthouse attributed 450 ms to unused JavaScript.

### `React.lazy` was the wrong fix — tried, measured, reverted

Implemented, measured, reverted. It halved the chunk and kept prerendered content correct, but:

| | before | with `React.lazy` |
|---|---|---|
| Performance (mn, mobile) | 0.90 | 0.82 |
| CLS (mobile) | 0.000 | 0.169 |
| CLS (desktop) | 0.000 | 0.078 |

A lazy component suspends on first render *during hydration*, so React discards the
server-rendered subtree and re-renders it when the chunk arrives — content present, absent,
present. A `modulepreload` of the block chunks changed CLS by **exactly zero**, proving this is
hydration-discard and not network timing. Every page here has its first block above the fold, the
worst possible place for that shift. This account is kept because it explains *why* the shipped
approach is shaped the way it is — resolving chunks before hydration, never during it.

### What shipped: resolve chunks before `hydrateRoot`

Each block's manifest split into eager metadata (`manifest.ts`: `variantNames`, `copy`, `nav`,
`schema`) and a deferred component map (`variants.ts`), so `registry.ts` → manifest → component is
no longer an unbroken static chain. `src/blocks/block-modules.ts` is the only dynamic-`import()`
split point; a custom `src/client.tsx` works out the current URL's block modules from
`pages.config` and `Promise.all`s their import before calling `hydrateRoot`, so no Suspense
boundary ever exists during hydration and no server-rendered subtree is discarded. A custom
`src/server.ts` side-effect-imports `variants.all.ts`, which registers every block's real component
synchronously, so prerendering is unaffected.

Main chunk: 559,152 → 333,399 bytes raw (177,109 → 107,379 gzip). A follow-up pass added
`modulepreload` for exactly the chunks each page's blocks need — computed from
`dist/client/.vite/manifest.json` at prerender time, then the manifest itself is deleted before it
ships — closing a discovery round-trip (main chunk → block chunk → its own `motion` import) that
was costing mobile `mn` about two points on its own.

Final numbers, clean rebuild, both mobile and desktop:

| | mn Performance | mn CLS | en Performance | en CLS |
|---|---|---|---|---|
| Mobile | 0.90 | 0 (5/5 runs) | 0.94 | 0 (5/5 runs) |
| Desktop | 1.00 | ~0 (float noise) | 1.00 | 0 |

**CLS stayed exactly 0 through every measurement in this whole investigation** — the property this
design exists to protect, and it held even while Performance dipped and recovered across the
intermediate steps (0.90 → 0.88 once chunks were split but not yet preloaded → 0.90 again once
`modulepreload` closed the discovery round-trip). `lighthouserc.json`'s mobile
`categories:performance` assertion moved from `warn` (target 0.95, relaxed) to a hard `error` at
`minScore: 0.85` — the number actually met. `lighthouserc.desktop.json` stayed `error` at 0.95,
since desktop measures 1.00 on both locales. Task 6 re-measured both numbers against the `warm`
preset and found them unchanged within noise — a token-preset swap changes CSS variables and
fonts, not the JavaScript this score is dominated by.

## Latent gaps in the verification scripts

None are reachable from the code as it stands. Each is recorded because the condition that makes
it safe could stop being true — which already happened three times during this build, so treat
"deferred" as *unproven*, not *safe*.

**`scripts/verify-build.mjs`**

- `decodeEntities` can double-decode a numeric ampersand reference immediately followed by an
  entity name — `&#38;amp;` yields `&` where a single-pass parser yields the literal `&amp;`.
  Unreachable: React never emits decimal `&#38;` for `&`.
- `extractObjectLiteral` counts braces with no string-literal awareness, so a registry entry like
  `label: '}'` would truncate the scan and silently stop checking entries declared after it.
  Unreachable while `registry.ts` holds only bare identifiers — **revisit the moment a registry
  line gains an inline object value.**
- `EXPECTED_HREFLANG` is a hardcoded `Set(['mn', 'en', 'x-default'])`. Adding a third locale means
  updating it, and it will not remind you.
- **The block-chunk filename convention is load-bearing and undeclared.** The preload assertion
  matches `/\/variants-[^/]+\.js$/`, which holds only because every block's component module is
  named `variants.ts` and Vite derives the chunk name from it. A future `chunkFileNames` or
  `manualChunks` setting, or a Vite major that changes chunk naming, turns the branch's most
  important performance guarantee into a red build whose message — "no block chunks preloaded —
  check plugin ordering in `vite.config.ts`" — points at the wrong thing entirely. The
  `bundle-split` assertion added this round is independent of chunk names and would stay green,
  which is the useful signal that the naming, not the split, is what broke.
- **`dist/server/.vite/manifest.json` is left behind.** `emit-plugin.ts` deletes
  `<outDir>/.vite` (the client one) after prerendering but not the server build's. Ruled harmless
  rather than fixed: `dist/server` is a Node bundle that is never a document root, so nothing is
  publicly exposed. It would matter to a deploy that served `dist/` wholesale.

**`scripts/check-conventions.mjs`**

- `resolveStringConsts` closes at the first matching quote, so `const x = 'a' + 'b'` resolves to
  just `'a'` — a violation hiding in the second operand would go undetected.
- It is a flat, scope-blind map over one file, so two `const field = '…'` declarations in different
  scopes of the same file collide, last match winning. **The four blocks that copy this pattern
  should avoid reusing an identifier name across scopes in one file.**
- A `const` holding a template literal, or an identifier imported from another module, is treated
  as unresolvable and *reported as a failure* — by design, so nothing passes unverified. A future
  compliant block using a template-literal class constant will fail `pnpm conventions` until it is
  rewritten as a plain string literal. That is the intended trade: a known-loud stop beats a
  silent gap.
- **The `<Link>` ban scans `.tsx` files only.** `walkFiles` filters on `p.endsWith('.tsx')`, so a
  `.ts` module that re-exports `Link` — `export { Link } from '@tanstack/react-router'` in a
  barrel file, say — is invisible to it, and every `.tsx` consumer then imports `Link` from a path
  the check does not recognise. The rule now covers `src/blocks`, `src/shell` **and** `src/routes`
  (that last gap closed this round), but the file-extension gap is still open.
- **The layout rules also scan `.tsx` only**, with the same consequence for a class string defined
  in a `.ts` file and imported.
- **`font-size: 0` is not in the hidden-content scan** (`verify-build.mjs`). `transform: scale(0)`
  and `clip-path: inset(100%)` were added this round; `font-size: 0` was deliberately left out
  because it is a legitimate technique for controlling whitespace between inline-block children,
  so a blanket ban would have a real false-positive rate. It does hide text.

## Small deferred items

Each is low-risk and was judged not worth churn during the build.

- `src/shell/chrome/header.tsx` — three hardcoded `locale === 'mn'` ternaries for aria-labels,
  rather than a config-owned label map. Fine while the system is bilingual-only.
- `src/shell/pages/resolve-link.ts` — `createResolver` imports `registry` at module scope instead
  of receiving it as a parameter. This is a shell→blocks dependency, inverting the layering every
  other shell file respects. Worth a parameter if this file is touched again.
- `src/shell/seo/json-ld.ts` — `BreadcrumbList`'s home crumb assumes `pages[0]` is the home page by
  array position rather than matching `path === '/'`. True in both current configs; silent under a
  future reorder.
- `src/shell/theme/theme-script.tsx` — the no-flash script's `|| defaultMode` fallback is
  unreachable, because the preceding `matchMedia` ternary always returns a truthy string. If
  `theme.default` is meant to override the OS preference as the initial state, it currently does
  not.
- `src/routes/index.tsx` and `src/routes/$.tsx` duplicate identical loader/`head`/component wiring.
  Mechanically necessary for file-based routing to have an explicit `/` route, but a shared helper
  would stop one drifting from the other.
- `src/submit-schema.ts` — `ContactInput` is dead since the wire type became `SubmissionInput`.
- `src/routes/docs.tsx` (which replaced `src/routes/debug.tsx`) is excluded from prerendering and
  from the sitemap, but nothing stops it live-rendering on an SSR deploy. Its `noindex, nofollow`
  meta is what keeps it out of the index there — and `robots.txt` deliberately does **not**
  `Disallow: /docs`, because a crawler that obeys a `Disallow` never fetches the page and so never
  reads the `noindex`. Both halves are now gated: `verify-build.mjs` fails on a `/docs` `Disallow`
  or a `/docs` sitemap entry, `check-conventions.mjs` fails if the meta is removed.
- `biome.json` emits one info-level notice about a deprecated field on every run.

## Unproven, not broken

Things that have never actually been exercised, recorded here so "we never tried it" is not
mistaken for "it works".

- **No build has ever been produced with `warm` as the default preset.** Every artifact in `dist/`,
  every number in this file and the README, and every assertion in both verification scripts
  describes an `editorial` build. Task 6's `warm` measurements came from a temporary local swap of
  `theme.css`'s `@import` that is not reproducible from any committed config, and the swap was
  reverted. So **warm + dark — the combination most likely to look wrong — has never rendered a
  real page in a real build.** The preset-completeness check added this round asserts warm declares
  the whole token surface, which is a genuine guarantee but a narrow one: it says nothing about
  whether the result looks right, and nothing about Lighthouse. Anyone making `warm` the default
  should expect to be the first person to see it.
- **`<html>` hydration mismatch, React error #418.** Observed on a production build served
  statically, identically with and without this round's `src/client.tsx` change (two builds, same
  error, same element) — so it is not a regression from that change. Not checked against `main`.
  `ThemeScript` sets the `dark` class on `<html>` before
  hydration, so the client's first render disagrees with the server-rendered attribute. React
  recovers, and CLS measures 0 in every Lighthouse run, so it is a warning rather than a defect —
  but it is a real mismatch and it is not currently recorded anywhere else.

## Deferred scope (not defects)

From spec §9, never built in the foundation. `features` and `cta` (Tasks 2–3) and the `warm`
preset (Task 6) have since shipped and are removed from this list; everything below is still
deferred:

- Four more blocks: `logos`, `testimonials`, `pricing`, `faq`.
- `hero`'s third variant, `screenshot`.
- A third token preset — `editorial` and `warm` exist today; the slot for a third is open.
- Automatic surface alternation exists but is exercised by only three blocks on one page (`hero`,
  `features`, `cta` on the home page).

The `noindex` `/variants` showcase page, previously listed here, is no longer deferred scope:
`/docs` (Task 5) absorbed its purpose — every block and variant, previewed in one place, excluded
from prerendering/sitemap/indexing the same way `/variants` would have been.
