# Maintaining Landing Kit

Notes for working on the kit itself. **None of this reaches a generated project**, and this file
is deliberately absent from `package.json`'s `files`, so it never ships to npm either — a person
installing the kit is building a landing page, not maintaining a generator.

If you are building a site, everything you need is in [README.md](./README.md).

## Contents

- [Maintainer commands](#maintainer-commands)
- [The three env flags](#the-three-env-flags)
- [Swapping the whole config: `configs/`](#swapping-the-whole-config-configs)
- [Lighthouse budget](#lighthouse-budget)
- [Publishing](#publishing)
- [What ships and what does not](#what-ships-and-what-does-not)

## Maintainer commands

`tools/kit.mjs` holds the commands that only make sense in this repository:

```bash
node tools/kit.mjs smoke:full         # default config, animated, server submit
node tools/kit.mjs smoke:onepage      # one-page config, no animation, endpoint submit
node tools/kit.mjs lighthouse         # mobile budget
node tools/kit.mjs lighthouse:desktop # desktop budget
```

They live here rather than in `package.json` `scripts` because `scripts` ships inside the published
tarball. Four commands pointing at `configs/` and `lighthouserc*` — neither of which is in
`files` — would appear in every consumer's `package.json` and none of them could run.

## The three env flags

Set at build or dev time. Each swaps an import alias in `vite.config.ts` — never an `if` inside a
component. A generated project gets a static `vite.config.ts` with the choice already baked in, so
these exist only here.

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

## Publishing

Published to npm as `@dewsoft/landing-kit`.

```bash
npm version patch     # or minor / major
npm publish
```

2FA is on for writes, so `npm publish` prompts for a one-time code.

Before publishing, test the real tarball rather than the working tree — that is what a user gets:

```bash
npm pack --pack-destination /tmp
cd /tmp && tar xzf dewsoft-landing-kit-*.tgz
node package/cli/index.mjs /tmp/smoke-scaffold --yes
```

Then install and `verify` that scaffold. This catches a missing entry in `files`, which no other
check can see.

## What ships and what does not

`files` in `package.json` is an allowlist: anything not named there never reaches the tarball.
That is the whole mechanism keeping the following out of a published install, with no build step
and no publish-time rewriting of `package.json`:

| Not shipped | Why |
|---|---|
| `tools/` | Maintainer commands — see above |
| `configs/` | The second config exists to test the kit, not to ship |
| `lighthouserc*.json` | Performance budgets for this repo's own build |
| `MAINTAINERS.md` | This file |

The README is trimmed on the way out too. `cli/copy.mjs` drops the sections a generated project
should not claim to have, and the generated project's own `pnpm conventions` fails on a dangling
table-of-contents entry — so a partial removal breaks loudly instead of shipping a dead anchor.
