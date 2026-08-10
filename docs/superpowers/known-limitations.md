# Known limitations and Plan 2 carry-forward

Everything here was found during the foundation build and deliberately left in place, with a
reason. Nothing in this file is a surprise or an oversight — it is the list of things a future
change should know about before touching the surrounding code.

## Open: Mongolian mobile Performance is 0.90 against a 0.95 target

Fully diagnosed. See the README's *Lighthouse budget* section and spec §6 for the numbers.

Two causes, one inherent and one not:

- **Inherent.** A bilingual page loads two font subsets. The chrome carries Latin text — brand
  name, email, phone — while the content is Cyrillic, so `unicode-range` correctly fetches both,
  roughly twice the English page's font payload. The Mongolian page will always be the harder one.
- **Not inherent.** Blocks are eagerly bundled into one ~553 KB chunk that every page loads, so the
  home page downloads the contact form's `react-hook-form` and `zod` (99 KB raw / 30 KB gzip)
  without a form on it. Lighthouse attributes 450 ms to unused JavaScript.

### `React.lazy` is the wrong fix — this was tried

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
worst possible place for that shift.

### The approach that should work

Resolve the chunks *before* `hydrateRoot` rather than deferring to render time. At the client
entry, work out which block modules the current URL needs — statically knowable from
`pages.config.ts`, or from the loader data already serialised for hydration — `Promise.all` the
dynamic imports, and only then hydrate. No Suspense boundary ever exists during the hydration
pass, so no subtree is discarded.

This keeps the single config-driven splat route (spec D10, §5) intact. It is real infrastructure
work — a custom client entry, plus wiring loader data to import specifiers — and it should be
prioritised **early** in Plan 2: the cost scales with block count, and 0.90 has no room left
before block #3.

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

**`scripts/check-conventions.mjs`**

- `resolveStringConsts` closes at the first matching quote, so `const x = 'a' + 'b'` resolves to
  just `'a'` — a violation hiding in the second operand would go undetected.
- It is a flat, scope-blind map over one file, so two `const field = '…'` declarations in different
  scopes of the same file collide, last match winning. **The six blocks that copy this pattern
  should avoid reusing an identifier name across scopes in one file.**
- A `const` holding a template literal, or an identifier imported from another module, is treated
  as unresolvable and *reported as a failure* — by design, so nothing passes unverified. A future
  compliant block using a template-literal class constant will fail `pnpm conventions` until it is
  rewritten as a plain string literal. That is the intended trade: a known-loud stop beats a
  silent gap.

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
- Headings on `/docs` are not sequentially descending: the page's `h2` section headings are
  followed by the gallery's `h3` block headings, and each preview then renders the block's own
  `h2` (blocks support `headingLevel` 1 or 2 only, and every preview must be 2 so the page keeps
  exactly one `h1`). Unavoidable without widening the block heading contract; `/docs` is
  `noindex` and developer-facing, so the cost is confined to that page.
- `biome.json` emits one info-level notice about a deprecated field on every run.

## Deferred scope (not defects)

From spec §9, never built in the foundation:

- Six more blocks: `logos`, `features`, `testimonials`, `pricing`, `faq`, `cta`.
- `hero`'s third variant, `screenshot`.
- Token presets 2 and 3 — only `aurora` exists.
- The `noindex` `/variants` showcase page.
- Automatic surface alternation exists but is barely exercised with two blocks.
