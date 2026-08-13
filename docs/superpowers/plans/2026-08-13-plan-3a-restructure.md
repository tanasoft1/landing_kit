# Plan 3a — React + Vite restructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make the kit look like a normal React + Vite + shadcn project, so a developer who has never used TanStack Start recognises the layout.

**Architecture:** three mechanical passes, each independently verifiable. First swap the import alias `~/` → `@/`. Then dissolve `src/shell/` into `src/components/` (all `.tsx`) and `src/lib/` (all `.ts`). Then shorten the long comments. No behaviour changes in any of them.

**Tech Stack:** TypeScript 6.0.3 (pinned exactly), React 19, TanStack Start, Vite, Tailwind v4, Biome, pnpm.

## Global Constraints

- **Zero behaviour change.** `pnpm verify`, `pnpm smoke:full`, `pnpm smoke:onepage` must pass exactly as before, and both Lighthouse configs must still pass with no threshold moved.
- **The built CSS must be byte-identical** to the baseline after every task. This is the sharpest available signal that nothing moved that shouldn't have.
- **Never edit `vite.config.ts` with a script, `sed`, `perl` or a heredoc.** Two prior attempts corrupted it. Use the Edit tool or an editor, always.
- **Never add a `prepare` script** to `package.json`.
- Do not relax any Lighthouse threshold. If a score misses, report it and stop.
- Do not introduce anything that can suspend during hydration — no `React.lazy`, no `Suspense` in the block path. A recorded regression took CLS from 0.000 to 0.169.
- `typescript` stays pinned at exactly `6.0.3` (via the `overrides` block in `pnpm-workspace.yaml`).
- Commit with conventional prefixes. One commit per task minimum.

## Note on testing

This project has **no test framework**, by deliberate decision. "Run the tests" means running the gate commands below. Do not add vitest, jest, or any test runner.

```bash
pnpm verify          # lint + typecheck + conventions + build + verify-build
pnpm smoke:full      # 4 pages
pnpm smoke:onepage   # 2 pages
pnpm lighthouse      # mobile,  >= 0.85 performance, hard error
pnpm lighthouse:desktop  # desktop, >= 0.95 performance, hard error
```

---

## File Structure

**Moving (20 files).** The rule is the file extension, nothing else:

| From | To |
|---|---|
| `src/shell/blocks/render-blocks.tsx` | `src/components/render-blocks.tsx` |
| `src/shell/chrome/header.tsx` | `src/components/header.tsx` |
| `src/shell/chrome/footer.tsx` | `src/components/footer.tsx` |
| `src/shell/layout/section.tsx` | `src/components/layout/section.tsx` |
| `src/shell/layout/container.tsx` | `src/components/layout/container.tsx` |
| `src/shell/pages/page-view.tsx` | `src/components/page-view.tsx` |
| `src/shell/theme/theme-script.tsx` | `src/components/theme-script.tsx` |
| `src/shell/theme/theme-toggle.tsx` | `src/components/theme-toggle.tsx` |
| `src/shell/docs/block-gallery.tsx` | `src/components/docs/block-gallery.tsx` |
| `src/shell/docs/config-reference.tsx` | `src/components/docs/config-reference.tsx` |
| `src/shell/docs/token-gallery.tsx` | `src/components/docs/token-gallery.tsx` |
| `src/shell/pages/enumerate.ts` | `src/lib/pages/enumerate.ts` |
| `src/shell/pages/resolve-link.ts` | `src/lib/pages/resolve-link.ts` |
| `src/shell/pages/resolve-request.ts` | `src/lib/pages/resolve-request.ts` |
| `src/shell/seo/block-preloads.ts` | `src/lib/seo/block-preloads.ts` |
| `src/shell/seo/build-head.ts` | `src/lib/seo/build-head.ts` |
| `src/shell/seo/emit-plugin.ts` | `src/lib/seo/emit-plugin.ts` |
| `src/shell/seo/json-ld.ts` | `src/lib/seo/json-ld.ts` |
| `src/shell/seo/out-dir.ts` | `src/lib/seo/out-dir.ts` |
| `src/shell/types.ts` | `src/lib/types.ts` |

`src/shell/` is then empty and gone.

**Modified, not moved:** `tsconfig.json`, `vite.config.ts`, `biome.json`, `components.json`, `scripts/check-conventions.mjs`, `scripts/verify-build.mjs` (comments only), `README.md`, every file in `src/` that imports with `~/` (44 files), and `configs/smoke-onepage/site.config.ts` + `configs/smoke-onepage/pages.config.ts`.

**Watch `configs/` and `vite.config.ts`.** Both sit outside `src/` and both reference the moved files — `configs/` through the `~/shell/types` alias, `vite.config.ts` through relative `./src/shell/...` paths. Every find-and-replace in this plan scopes to `src/`, `configs/` and `scripts/`; `vite.config.ts` is edited by hand only.

**Not changed, and confirm it stays that way:** `src/styles/theme.css`. Its globs are `@source "../**/*.{ts,tsx}"` and `@source "../../configs/**/*.{ts,tsx}"` — relative to `src/styles/`, so they already cover all of `src/`. The moves stay inside `src/`. If you find yourself editing this file, stop and re-read why.

---

### Task 1: Swap the import alias `~/` → `@/`

No files move. Pure find-and-replace plus four config files. Done first because it is the change with the least structural risk, and it means Task 2 only has to think about paths.

**Files:**
- Modify: `tsconfig.json` (the `paths` block)
- Modify: `vite.config.ts` (the `resolve.alias` block) — **by hand, never with a script**
- Modify: `biome.json:22-29` (the `noRestrictedImports` paths)
- Modify: `components.json` (the `aliases` block)
- Modify: every file under `src/` with a `~/` import (44 files)
- Modify: `configs/smoke-onepage/site.config.ts` and `configs/smoke-onepage/pages.config.ts` (3 `~/` imports) — easy to miss, they sit outside `src/`
- Modify: `README.md`

**Interfaces:**
- Produces: `@/*` resolves to `./src/*`; `@/motion`, `@/theme`, `@/submit`, `@/config` are the four boundary aliases. Every later task and all of Plan 3b uses these names.

- [ ] **Step 1: Record the baseline**

```bash
pnpm build
find dist/client/assets -name "*.css" -exec shasum -a 256 {} \; | awk '{print $1}' > /tmp/css-baseline.txt
cat /tmp/css-baseline.txt
```

Keep that hash. Every task checks against it.

- [ ] **Step 2: Confirm the gate is green before you touch anything**

Run: `pnpm verify && pnpm smoke:full && pnpm smoke:onepage`

Expected: all exit 0, 4 pages / 4 pages / 2 pages. If anything fails now, stop and report — you cannot attribute a later failure to your own change otherwise.

- [ ] **Step 3: Update `tsconfig.json`**

There are four entries. Order matters: the wildcard must come last.

```json
    "paths": {
      "@/motion": ["./src/motion.animated.tsx"],
      "@/theme": ["./src/theme.both.tsx"],
      "@/submit": ["./src/submit.endpoint.ts"],
      "@/*": ["./src/*"]
    }
```

- [ ] **Step 4: Update `vite.config.ts` by hand**

In the `resolve.alias` block, rename the five keys. Do not change the values or the order — order is load-bearing, the `~` catch-all must stay last.

```ts
  resolve: {
    alias: {
      '@/motion': animation === 'on' ? r('./src/motion.animated.tsx') : r('./src/motion.noop.tsx'),
      '@/theme':
        site.theme.mode === 'both' ? r('./src/theme.both.tsx') : r('./src/theme.single.tsx'),
      // `submit.rpc.ts`, deliberately NOT `submit.server.ts`: TanStack Start's import protection
      // denies client bundling of any `**/*.server.*` file by FILENAME, regardless of content.
      // Renaming keeps that guard intact everywhere rather than excluding a file from it.
      '@/submit': submit === 'server' ? r('./src/submit.rpc.ts') : r('./src/submit.endpoint.ts'),
      '@/config': config === 'onepage' ? r('./configs/smoke-onepage') : r('./src/config'),
      '@': r('./src'),
    },
```

Only the five keys change. Every value stays exactly as it is, and the order stays as it is —
the `'@'` catch-all must remain last or it will shadow the four specific aliases.

One more spot in the same file, also by hand: the comment at `vite.config.ts:18` opens with
"The `~/config` alias below" — change that to `@/config`.

The `submit` comment above is already shortened per Task 3's rule (it was six lines); that is
intentional, apply it as written.

**Use the Edit tool. Do not use `sed`, `perl`, or a heredoc on this file** — two prior attempts corrupted it and cost a full debugging cycle.

- [ ] **Step 5: Update `biome.json`**

Six of the eight `noRestrictedImports` keys start with `~/`. Rename the keys and the message text:

```json
                  "motion": "Blocks must import animation presets from '@/motion', never 'motion' directly.",
                  "motion/react": "Blocks must import animation presets from '@/motion', never 'motion/react' directly.",
                  "@/motion.animated": "Import '@/motion' — the alias selects the implementation.",
                  "@/motion.noop": "Import '@/motion' — the alias selects the implementation.",
                  "@/theme.both": "Import '@/theme' — the alias selects the implementation.",
                  "@/theme.single": "Import '@/theme' — the alias selects the implementation.",
                  "@/submit.rpc": "Import '@/submit' — the alias selects the implementation.",
                  "@/submit.endpoint": "Import '@/submit' — the alias selects the implementation."
```

- [ ] **Step 6: Update `components.json`**

```json
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
```

- [ ] **Step 7: Rewrite the imports in `src/` and `configs/`**

`configs/` is easy to forget — it is outside `src/`, but `configs/smoke-onepage/` imports `~/shell/types` and `~/blocks/registry`. Miss it and `pnpm smoke:onepage` fails at Step 9.

Only import specifiers. Match the quote so a stray `~/` in prose is not touched:

```bash
grep -rl "from '~/\|import('~/" src/ configs/ | xargs perl -pi -e "s{(from |import\()'~/}{\$1'\@/}g"
```

Then confirm nothing was missed and nothing else changed:

```bash
grep -rn "'~/" src/ configs/ || echo "clean: no ~/ import specifiers left"
git diff --stat
```

Expect 3 changed lines in `configs/`, across two files.

- [ ] **Step 8: Verify the boundary aliases still resolve**

The three implementation-swapping aliases are the easiest thing to break, because nothing imports them by their real filename.

Run: `pnpm typecheck`

Expected: PASS. If it fails with "Cannot find module '@/motion'", the `tsconfig.json` `paths` entry is wrong or the wildcard is above the specific entries.

- [ ] **Step 9: Run the full gate**

```bash
pnpm verify && pnpm smoke:full && pnpm smoke:onepage
```

Expected: all exit 0, 4 / 4 / 2 pages.

- [ ] **Step 10: Prove the CSS is unchanged**

```bash
find dist/client/assets -name "*.css" -exec shasum -a 256 {} \; | awk '{print $1}' > /tmp/css-after-1.txt
diff /tmp/css-baseline.txt /tmp/css-after-1.txt && echo "CSS IDENTICAL"
```

Expected: `CSS IDENTICAL`. If it differs, an import was rewritten into something Tailwind now scans differently. Investigate before continuing — do not proceed with a changed stylesheet.

- [ ] **Step 11: Prove the Biome rule still fires**

An assertion nobody has watched fail could be one that can never fire. This project has been bitten by that three times.

Temporarily add this line to `src/blocks/hero/hero-centered.tsx`:

```ts
import { motion } from 'motion/react'
```

Run: `pnpm lint`

Expected: FAIL, with the message "Blocks must import animation presets from '@/motion', never 'motion/react' directly."

Then remove the line and confirm `pnpm lint` passes again.

- [ ] **Step 12: Update `README.md`**

Replace every `~/` used as an import alias with `@/`. Read each occurrence — do not blind-replace, because `~` may also appear meaning a home directory or an approximation ("~300px").

Run: `pnpm conventions`

Expected: PASS. The RECIPES↔README heading guard runs here; if you changed a `##` heading it will tell you.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "refactor: use the @/ import alias, matching React and Vite convention"
```

---

### Task 2: Dissolve `src/shell/` into `src/components/` and `src/lib/`

**Files:**
- Move: the 20 files in the File Structure table above
- Modify: every file importing from `@/shell/...` (73 import sites), including `configs/smoke-onepage/`
- Modify: `vite.config.ts:10-12` and `:28` — **by hand**. These are relative paths (`./src/shell/...`), not `@/shell/`, so no find-and-replace will catch them.
- Modify: `scripts/check-conventions.mjs:258`, `:261-262`, `:268`, `:325`, `:485`, `:497`, `:567`
- Modify: `scripts/verify-build.mjs:13`, `:74` (comments only)
- Modify: `README.md`

**Interfaces:**
- Consumes: the `@/` alias from Task 1.
- Produces: `@/components/layout/section`, `@/components/layout/container`, `@/lib/types`, `@/lib/seo/*`, `@/lib/pages/*`, `@/components/*`. Plan 3b's CLI copies these exact paths.

- [ ] **Step 1: Move the files with `git mv`**

`git mv` keeps the file history, which matters — these files carry hard-won decisions in their comments and you want `git log --follow` to still find them.

```bash
mkdir -p src/components/layout src/components/docs src/lib/pages src/lib/seo

git mv src/shell/blocks/render-blocks.tsx  src/components/render-blocks.tsx
git mv src/shell/chrome/header.tsx         src/components/header.tsx
git mv src/shell/chrome/footer.tsx         src/components/footer.tsx
git mv src/shell/layout/section.tsx        src/components/layout/section.tsx
git mv src/shell/layout/container.tsx      src/components/layout/container.tsx
git mv src/shell/pages/page-view.tsx       src/components/page-view.tsx
git mv src/shell/theme/theme-script.tsx    src/components/theme-script.tsx
git mv src/shell/theme/theme-toggle.tsx    src/components/theme-toggle.tsx
git mv src/shell/docs/block-gallery.tsx    src/components/docs/block-gallery.tsx
git mv src/shell/docs/config-reference.tsx src/components/docs/config-reference.tsx
git mv src/shell/docs/token-gallery.tsx    src/components/docs/token-gallery.tsx

git mv src/shell/pages/enumerate.ts        src/lib/pages/enumerate.ts
git mv src/shell/pages/resolve-link.ts     src/lib/pages/resolve-link.ts
git mv src/shell/pages/resolve-request.ts  src/lib/pages/resolve-request.ts
git mv src/shell/seo/block-preloads.ts     src/lib/seo/block-preloads.ts
git mv src/shell/seo/build-head.ts         src/lib/seo/build-head.ts
git mv src/shell/seo/emit-plugin.ts        src/lib/seo/emit-plugin.ts
git mv src/shell/seo/json-ld.ts            src/lib/seo/json-ld.ts
git mv src/shell/seo/out-dir.ts            src/lib/seo/out-dir.ts
git mv src/shell/types.ts                  src/lib/types.ts
```

Confirm `src/shell/` is gone:

```bash
ls src/shell 2>&1 | head -1   # expect: No such file or directory
```

- [ ] **Step 2: Rewrite the imports**

Longest patterns first, so a shorter one cannot shadow a longer one:

```bash
grep -rl "@/shell/" src/ configs/ scripts/ | xargs perl -pi -e "
  s{\@/shell/blocks/render-blocks}{\@/components/render-blocks}g;
  s{\@/shell/chrome/}{\@/components/}g;
  s{\@/shell/layout/}{\@/components/layout/}g;
  s{\@/shell/pages/page-view}{\@/components/page-view}g;
  s{\@/shell/theme/}{\@/components/}g;
  s{\@/shell/docs/}{\@/components/docs/}g;
  s{\@/shell/pages/}{\@/lib/pages/}g;
  s{\@/shell/seo/}{\@/lib/seo/}g;
  s{\@/shell/types}{\@/lib/types}g;
"
grep -rn "@/shell" src/ configs/ scripts/ || echo "clean: no @/shell references left"
```

`configs/smoke-onepage/` imports `@/shell/types` in both its files. It is outside `src/`, so it is the one most likely to be skipped.

- [ ] **Step 2b: Update `vite.config.ts` by hand**

This file imports three of the moved files by **relative path**, so the find-and-replace above cannot see them. It is also the file the global constraints forbid scripting. Use the Edit tool.

Lines 10-12 become:

```ts
import { enumerateUrls } from './src/lib/pages/enumerate'
import { emitSeoFiles } from './src/lib/seo/emit-plugin'
import { OUT_DIR } from './src/lib/seo/out-dir'
```

Line 28's comment becomes:

```ts
  // Read by `src/lib/seo/block-preloads.ts` at prerender time: `dist/client/.vite/manifest.json`
```

Import order matters to Biome's `organizeImports`: `./src/lib/...` sorts after `./src/config/...`, which is where these three already sit, so the existing order still holds. Run `pnpm lint` after the edit to confirm.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`

Expected: PASS. Any failure names the exact file and specifier that was missed.

- [ ] **Step 4: Update the paths in `scripts/check-conventions.mjs`**

Four are live path literals; three are comments and a summary line. Getting a literal wrong silently stops enforcing a rule, so change them deliberately rather than with a blanket replace.

**The four that change behaviour:**

At `:261-262`, the primitive exemption list:

```js
  'src/components/layout/section.tsx',
  'src/components/layout/container.tsx',
```

At `:268`, the layout-rule walk:

```js
walk('src/components', { headings: false }, isLayoutPrimitive)
```

At `:325`, the `<Link>` ban walk:

```js
walkFiles('src/components', checkNoRouterLink)
```

At `:497`, the RECIPES source:

```js
const CONFIG_REFERENCE = 'src/components/docs/config-reference.tsx'
```

**The three that are text only, but must not be left pointing at a folder that no longer exists:**

At `:258`, inside the comment above `LAYOUT_PRIMITIVES`: `src/shell/layout/` → `src/components/layout/`.

At `:485`, above the RECIPES guard: `src/shell/docs/config-reference.tsx` → `src/components/docs/config-reference.tsx`.

At `:567`, the success summary line, which names the walked directories:

```js
  '✓ check-conventions: layout primitives in blocks/routes/components, no literal <h1>/<h2> in blocks, ' +
```

**`src/lib` is deliberately not walked.** The layout rules are about JSX — raw `<section>`, `py-section`, literal headings — and `src/lib` holds no JSX at all. Adding it would scan files that cannot violate the rules. If a `.tsx` file ever appears under `src/lib`, it is in the wrong folder.

- [ ] **Step 5: Prove the convention checks still catch violations**

Four separate rules moved. Watch each one fail, or you do not know it still works.

```bash
# (a) layout rule on a component
printf '\nexport const X = () => <div className="min-h-screen" />\n' >> src/components/header.tsx
node scripts/check-conventions.mjs    # expect FAIL naming min-h-screen
git checkout src/components/header.tsx

# (b) the <Link> ban on a component
#     Add this line by hand as the first line of src/components/footer.tsx:
#       import { Link } from '@tanstack/react-router'
node scripts/check-conventions.mjs    # expect FAIL naming Link
git checkout src/components/footer.tsx

# (c) the primitive exemption still applies
node scripts/check-conventions.mjs    # expect PASS — section.tsx uses raw <section> legitimately

# (d) the RECIPES guard still reads the moved file
node scripts/check-conventions.mjs    # covered by (c); confirm the ✓ line mentions RECIPES
```

Paste the exact output of each into your report.

- [ ] **Step 6: Update the two comments in `scripts/verify-build.mjs`**

At `:13`, `src/shell/seo/emit-plugin.ts` → `src/lib/seo/emit-plugin.ts`.
At `:74`, `src/shell/pages/enumerate.ts` → `src/lib/pages/enumerate.ts`.

A comment pointing at a file that does not exist is exactly the defect class the last plan spent a whole round eliminating.

- [ ] **Step 7: Run the full gate**

```bash
pnpm verify && pnpm smoke:full && pnpm smoke:onepage
```

Expected: all exit 0, 4 / 4 / 2 pages.

- [ ] **Step 8: Prove the CSS is still unchanged**

```bash
find dist/client/assets -name "*.css" -exec shasum -a 256 {} \; | awk '{print $1}' > /tmp/css-after-2.txt
diff /tmp/css-baseline.txt /tmp/css-after-2.txt && echo "CSS IDENTICAL"
```

Expected: `CSS IDENTICAL`.

- [ ] **Step 9: Confirm `theme.css` was not touched**

```bash
git diff --stat src/styles/theme.css   # expect: no output
```

Expected: empty. The globs are relative to `src/styles/` and already cover all of `src/`.

- [ ] **Step 10: Update `README.md`**

Replace every `src/shell/...` path with its new home. Check the Contents list and the `pnpm conventions` row in the Scripts table — that row names the directories the layout rules cover, and it now says `src/shell`.

Run: `pnpm conventions`

Expected: PASS.

- [ ] **Step 11: Run both Lighthouse configs**

```bash
pnpm lighthouse && pnpm lighthouse:desktop
```

Expected: both pass, no threshold moved. Report the numbers.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: replace src/shell with src/components and src/lib"
```

---

### Task 3: Shorten the comments

**Files:**
- Modify: `src/blocks/registry.ts`, `src/blocks/variants.all.ts`, `src/blocks/block-modules.ts` (the three worst)
- Modify: any other file whose comments exceed the rule below

**Interfaces:**
- Consumes: the structure from Tasks 1 and 2.
- Produces: nothing other code depends on.

**The rule.** Developers read this code, and so does an AI assistant helping them.

1. One or two lines. If it needs a paragraph, the code needs restructuring instead.
2. Only where the code is surprising. Delete anything that restates what the code says.
3. **Keep the facts that were expensive to learn.** State them briefly instead of deleting them.

That third point is the one to get right. These comments record real measured findings, and the project has already been bitten by losing a justification. Facts that must survive, in short form:

- Why `<Link>` from `@tanstack/react-router` is banned (block modules are resolved per-URL before hydration and are not re-resolved on a client-side route change).
- Why block modules resolve before hydration and never via `React.lazy` (measured CLS 0.000 → 0.169).
- Why `variants.all.ts` uses `Record<BlockId, …>` rather than bare calls (a missing block otherwise compiles, lints and passes conventions, failing only as a 500 on `/docs`).
- Why `registry.ts` uses `any` in its `satisfies` (the `schema` property is checked contravariantly, so `unknown` makes every concrete manifest fail).
- Why `registry` is re-declared as its own object literal rather than `= manifests` (`verify-build.mjs` scans the source text for `export const registry`).
- Why `--elevation-card` is `0 0 #0000` and not `none` (`none` is invalid inside a comma-separated shadow list).

- [ ] **Step 1: Rewrite `src/blocks/registry.ts`**

Today it carries a ten-line comment about type contravariance above a four-line object, plus a second seven-line one. Target roughly this density:

```ts
// `any`, not `unknown`: `schema` is a property, so TS checks it contravariantly and every
// concrete manifest would fail `satisfies` against `BlockManifest<unknown, unknown>`.
// biome-ignore lint/suspicious/noExplicitAny: unknown breaks assignability here.
const manifests = { hero, contact, features, cta } satisfies Record<string, BlockManifest<any, any>>

// Derived from the object keys so it cannot drift from the registry.
export type BlockId = keyof typeof manifests

// A literal, not `= manifests`: verify-build.mjs scans the source text for this declaration.
// biome-ignore lint/suspicious/noExplicitAny: same reason as above.
export const registry: Record<BlockId, BlockManifest<any, any>> = { hero, contact, features, cta }
```

- [ ] **Step 2: Rewrite `src/blocks/variants.all.ts` and `src/blocks/block-modules.ts`**

Same rule. `variants.all.ts` currently has a 20-line block comment; the load-bearing facts are: server-only, must stay unreachable from `src/client.tsx`, and the `Record<BlockId, …>` type is what makes a missing block a compile error rather than a 500 on `/docs`. Three short lines, not twenty.

- [ ] **Step 3: Sweep the rest**

```bash
# Files with comment blocks longer than 6 lines
grep -rn "^\s*\(//\|\*\)" src/ --include="*.ts" --include="*.tsx" | awk -F: '{print $1}' | uniq -c | sort -rn | head -20
```

Apply the same rule to what that turns up. Do not touch `src/styles/theme.css`'s header comment — it explains the Tailwind source-scanning decision, which is genuinely surprising and cost a full investigation round to get right; shorten it, but keep the measured numbers.

- [ ] **Step 4: Run the full gate**

```bash
pnpm verify && pnpm smoke:full && pnpm smoke:onepage
```

Expected: all exit 0, 4 / 4 / 2 pages.

- [ ] **Step 5: Prove the CSS is still unchanged**

```bash
find dist/client/assets -name "*.css" -exec shasum -a 256 {} \; | awk '{print $1}' > /tmp/css-after-3.txt
diff /tmp/css-baseline.txt /tmp/css-after-3.txt && echo "CSS IDENTICAL"
```

Expected: `CSS IDENTICAL`.

This check matters most here. Tailwind's scanner reads comments in scanned `.ts`/`.tsx` files, so a comment naming a utility class injects it into the stylesheet. Deleting comments should only ever remove bytes — and this diff says whether the shipped CSS moved at all. If it changed, say so in your report with the before and after sizes rather than treating a smaller file as automatically fine.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: shorten comments to one or two lines each"
```

---

## Definition of done

- [ ] `src/shell/` no longer exists
- [ ] `grep -rn "~/" src/ configs/ scripts/ vite.config.ts tsconfig.json biome.json components.json README.md` returns nothing that is an import alias
- [ ] `grep -rn "shell" src/ configs/ scripts/ vite.config.ts README.md` returns nothing
- [ ] `pnpm verify`, `pnpm smoke:full`, `pnpm smoke:onepage` all exit 0
- [ ] `pnpm lighthouse` and `pnpm lighthouse:desktop` both pass, no threshold moved
- [ ] Built CSS hash matches the Task 1 Step 1 baseline
- [ ] `git diff --stat src/styles/theme.css` is empty
- [ ] Each convention rule was watched failing after its path moved, with output pasted in the report
- [ ] The Biome `noRestrictedImports` rule was watched failing under its new `@/` names
- [ ] `README.md` names the new paths and the new alias
