# Plan 2 — Out-of-box experience

- **Date:** 2026-08-06
- **Status:** Approved, ready for implementation planning
- **Predecessor:** `2026-08-01-landing-kit-design.md` (the foundation, shipped and merged)

## 1. Goal

After `pnpm install && pnpm dev`, someone who has never seen this repo should get a landing page
they would be willing to show a client, and understand how to change it within a few minutes.

That is the whole of Plan 2. Everything below either makes the default output look finished, or
makes the system legible to the person who inherits it.

### What already exists

The foundation shipped: bilingual `mn`/`en` routing with the default locale unprefixed, a
config-driven page system, the block contract, three swappable boundaries (`~/motion`, `~/theme`,
`~/submit`), the full SEO layer, prerendering with `verify-build.mjs`, `hero` with two variants,
and `contact` with a working form. Desktop Lighthouse is 100/100/100 with CLS ≈ 0.

What it does **not** have is a look anyone would ship, or enough sections to read as a site.

### Non-goals

- A monorepo (see *Rejected alternatives* in §2).
- The remaining four blocks — `logos`, `testimonials`, `pricing`, `faq` — and `hero`'s
  `screenshot` variant. Plan 3.
- A third token preset. Two demonstrate the mechanism; three is inventory.
- The scaffolding CLI. Still after Plan 3, when there are enough blocks to test it against.

## 2. Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | No monorepo; stay a single package | The goal is comprehensibility, and a workspace adds a wiring layer that serves the maintainer, not the reader. See *Rejected alternatives* below |
| D2 | Two blocks added: `features` and `cta` | Hero → features → cta → (nav) contact is a complete site shape. Two good sections beat six mediocre ones |
| D3 | Editorial as the default preset, soft/warm as the second | Editorial reskins best and suits bilingual Cyrillic/Latin; the pair proves the token layer carries personality, not just hue |
| D4 | `/docs` is a living surface generated from real data | Prose docs drift from code and the reader cannot tell which is wrong. Rendering from `registry` and the live CSS makes drift impossible |
| D5 | `/docs` replaces `/debug` and the planned `/variants` | One developer-facing surface, not three routes |
| D6 | `/docs` is English-only | It is for developers; translating it is maintenance with no reader |
| D7 | `/docs` ships in the scaffolded output | The developer who most needs it is the one who receives a generated site having never seen the kit |
| D8 | The pre-hydration import fix lands in this plan | Adding two blocks to the eager bundle pushes mobile performance *down*; polishing the look while performance regresses is the wrong trade for a kit that sells on SEO |
| D9 | Mobile Lighthouse budget becomes ≥ 0.85, desktop stays ≥ 0.95, **both as hard failures** | Mobile runs under 4× CPU throttling, so a lower bar there is honest rather than lax. This removes the `warn` the foundation shipped with — no assertion is soft any more |

### Rejected alternatives

**Monorepo (`apps/demo` + `packages/shell` + `packages/blocks`).** Considered seriously and
dropped. It buys compiler-enforced boundaries — the shell could no longer reach into blocks, which
it currently does in four places. But the stated goal is that a newcomer understands the kit
quickly, and the reference points for that (Untitled UI, Velora UI) are single repos you copy
from: their legibility comes from having nothing between the reader and the code.

It also has a second cost that only appeared once the goal was clear. The scaffolded output must
be flat and simple. If the kit is a workspace and the output is flat, the CLI has to rewrite
imports on the way out — a transformation, and transformations drift from the thing they
transform, which is exactly the failure mode the foundation's architecture was built to avoid.
There is a trick that dodges it (keep `~/shell` as the specifier in both contexts and remap it),
but then pnpm enforces nothing and the packages are folders in costume.

Revisit when the CLI is real, and when client work has shown which parts genuinely do not diverge
— that is the knowledge that decides where package boundaries belong.

**A third preset.** Two presets that differ in radius, shadow, colour temperature and density
already prove the token layer carries personality. A third is inventory to maintain and one more
thing to check in both themes on every visual change.

**Six blocks in this plan.** They make the kit comprehensive, but nothing in the goal needs them,
and six rushed sections would undercut "willing to show a client" more than two considered ones.

## 3. Visual direction

The current `aurora` preset is functional placeholder colour, not design. It is **replaced**, not
kept alongside: `src/styles/presets/aurora.css` is removed and the two presets below take its
place, named for the personality they carry rather than for a colour.

| File | Role |
|---|---|
| `src/styles/presets/editorial.css` | Default. Imported by `theme.css` |
| `src/styles/presets/warm.css` | The alternative. Swap the `@import` to use it |

Both are token-layer changes only: no component is edited, which is also the proof that the token
layer works.

### Default preset — editorial

Type carries the design; colour is restrained; separation comes from space and surface tone rather
than lines.

- **A wider display-to-body ratio than today**, tighter tracking on headings, and a genuinely large
  hero size. The current scale is safe, and safe reads as unfinished.
- **One accent colour**, used sparingly — a button, a link, an eyebrow. Everything else is a
  neutral ramp. This restraint is what makes the preset swap dramatic: when structure carries the
  design, changing the accent changes the whole feel.
- **Fewer borders and shadows.** Sections separate by background tone, which the existing
  alternating `surface` mechanism already provides and which is currently tuned too subtly to read.
- **More vertical air.** `--section-y` noticeably larger.

Chosen as the default because it reskins best, ages well, and suits the material: Mongolian
Cyrillic has an even vertical rhythm that large clean type flatters, where heavy display faces
crowd.

### Second preset — soft/warm

Differs in **radius, shadow, colour temperature and density**, not merely hue: rounder corners,
soft layered shadows, warmer neutrals, tighter vertical rhythm, friendlier weights. A client who
wants "welcoming" rather than "considered" gets it by swapping one import.

Both presets must satisfy the accessibility budget in **both** light and dark, which remain
authored rather than derived (foundation spec §8).

## 4. New blocks

Two, following the existing contract exactly: a folder, one registry line, explicit copy types,
`headingLevel` and `surface` and `anchorId` from props, no hardcoded heading tags, no
arbitrary-value classes.

**`features`** — the explainer. Variants `grid` (default) and `alternating`. Copy is a heading,
a lead, and a list of items with title and body. `alternating` additionally supports an optional
per-item image, which is a variant-specific optional field on the shared copy type.

**`cta`** — the closer. Variants `banner` (default) and `split`. Copy is a heading, a lead and one
or two calls to action, whose targets resolve through `resolve()` exactly as hero's do, so the same
copy produces a page link in multi-page mode and an anchor in one-page mode.

Neither contributes JSON-LD: per the foundation spec §4, `BlockSchema` is reserved for markup a
block's own content earns, and neither has any.

Default page composition becomes `hero → features → cta`, with `contact` on its own page reached
from the nav.

## 5. `/docs` — a living developer surface

One route, English-only, four sections. Excluded from prerendering, the sitemap and `robots.txt`,
exactly as `/debug` is today. It replaces both `/debug` and the planned `/variants`.

- **Tokens.** Swatches and type specimens rendered with the live CSS variables, shown in both
  presets and both themes. Editing `editorial.css` changes this page; there is no second copy of
  the values to forget.
- **Block gallery.** Every block, every variant, rendered live by iterating `registry`. Adding a
  block makes it appear here, and the existing registry-parity check in `verify-build.mjs`
  guarantees no block can be missing from `registry` in the first place.
- **Recipes.** Prose, sitting beside the live examples it describes: adding a block, adding a
  variant, reskinning, and the three env flags.
- **Config reference.** The shapes of `pages.config.ts` and `site.config.ts`, rendered from the
  current values so the reader sees a real example rather than an abstract type. `/debug`'s URL
  enumeration folds in here.

Two properties matter more than the content:

**It cannot drift.** Anything derivable from `registry` or the CSS is derived, not restated.

**It is a legibility test.** A section that is hard to write signals an API that is hard to
understand — useful feedback now, while there are four blocks and changing the contract is cheap.

## 6. Performance

The foundation shipped with one known gap: Mongolian mobile Performance 0.90 against a 0.95 target,
caused by an LCP of ≈ 3.0 s that is almost entirely render delay. Two contributors, one inherent
(a bilingual page loads both Cyrillic and Latin subsets, because the chrome carries Latin brand
name, email and phone while the content is Cyrillic) and one not (blocks are eagerly bundled into a
single chunk every page loads).

Adding `features` and `cta` makes the second one worse, which is why the fix lands here.

**The mechanism: resolve block chunks before `hydrateRoot`, not during render.** `React.lazy` was
implemented and reverted in the foundation because a lazy component suspends on its first render
*during hydration*, so React discards the server-rendered subtree and re-renders it when the chunk
arrives — Performance fell to 0.82 and CLS rose to 0.169 mobile / 0.078 desktop. A `modulepreload`
changed CLS by exactly zero, proving hydration-discard rather than network timing.

So: at the client entry, determine which block modules the current URL needs — statically knowable
from `pages.config.ts` — `Promise.all` the dynamic imports, then hydrate. No Suspense boundary
exists during the hydration pass, so no subtree is discarded. The single config-driven splat route
is unchanged.

**Success criteria:** CLS stays at 0 on both presets, the prerendered HTML still contains fully
rendered blocks, and mobile Performance improves rather than regressing with two blocks added.

### Budget

| Preset | Performance | Accessibility | SEO | CLS |
|---|---|---|---|---|
| Desktop | ≥ 0.95 | ≥ 0.95 | 1.00 | ≤ 0.01 |
| Mobile | ≥ 0.85 | ≥ 0.95 | 1.00 | ≤ 0.01 |

**Every assertion is a hard failure on both presets.** The foundation shipped mobile Performance as
a `warn` because 0.90 missed a 0.95 target; a 0.85 mobile bar reflects that mobile runs under 4×
CPU throttling, so nothing is soft any more. `lighthouserc.json`'s explanatory comment about the
`warn` is removed with it.

## 7. Verification

Unchanged in kind — no test frameworks. The existing gates cover most of this plan:

- `pnpm verify` — lint, typecheck, conventions, build, `verify-build.mjs`.
- `pnpm smoke:full` and `pnpm smoke:onepage` — both must still pass, and the one-page config must
  still require **zero** component changes. With `features` and `cta` added it exercises more.
- `pnpm lighthouse` and `pnpm lighthouse:desktop` — now both hard failures.

Two additions:

- `verify-build.mjs` gains an assertion that `/docs` was **not** prerendered, matching the existing
  check for `/debug`, which it replaces.
- The visual work is verified by looking at it, at 320/375/768/1280/1536 px, in both presets and
  both themes. That is eight combinations per page; the `/docs` token section exists partly to make
  that sweep quick.

## 8. How this eventually ships (context for Plan 3)

Not built here, but it constrains decisions in this plan, so it is recorded rather than assumed.

The consumer already has a monorepo — `apps/backend`, `apps/db`, and so on, with the backend
boilerplate built separately by someone else. They install the CLI (`pnpm add -D landing-kit`) and
it writes `apps/frontend`: its own `package.json`, `src/blocks/`, `src/shell/`, sample pages and
routes. Flat and readable inside that folder.

**Exactly one thing is published, and it is the generator.** The code the CLI writes carries no
`@tanasoft/*` dependency — it is the client's outright, free to diverge. This is the shadcn model,
and it is why D1 keeps this repo a single package: the repo is the source the CLI copies from, and
the consumer's workspace is theirs, not ours.

Two requirements this places on Plan 3:

- **The CLI must work inside an existing workspace.** Detect a `pnpm-workspace.yaml`, write into a
  target directory the user names, and never assume it owns the repo root. Scaffolding into an
  occupied monorepo is a different problem from scaffolding an empty directory.
- **`~/submit` defaults to `endpoint`.** With a real backend beside it in the same monorepo, the
  TanStack server-function variant is the exception, not the default.

Two things this confirms about the present plan: `/docs` shipping in the output (D7) is right,
because the developer receiving `apps/frontend` has never seen this repo; and copying source rather
than depending on published packages (foundation decision) is what lets a client site diverge
without our release cadence reaching into their monorepo.

## 9. Deferred to Plan 3

- `logos`, `testimonials`, `pricing`, `faq`.
- `hero`'s `screenshot` variant.
- A third preset, if client work ever calls for one.
- The scaffolding CLI, and the monorepo question that comes with it.
- The latent gaps recorded in `docs/superpowers/known-limitations.md`, each of which names the
  condition that would make it live.
