# Plan 3 — the scaffolding CLI

**Goal:** one command creates a working `frontend/` folder inside a developer's project.

**Status:** design approved 2026-08-13. Supersedes §12 of the foundation spec where they differ.

---

## 1. What this is

A developer has a project repo. It already has `backend/` in it. They run:

```bash
pnpm dlx @dewdie/landing-kit@latest frontend
```

They now have `frontend/` — a complete bilingual landing site. Routing, SEO, dark mode,
blocks and styles are all set up. They open it and start changing things.

The generated code is theirs. It has no dependency on this kit. Nothing links back.

```
monorepo/
├── backend/
└── frontend/          ← the CLI writes this
```

## 2. Scope

**In:** the scaffold command. It asks four questions, copies files, writes configs, stops.

**Out, and deliberately so:**

| Not building | Why |
|---|---|
| `add-block` command | Its own project. It must *edit* existing files, which is much harder than writing new ones. |
| `upgrade` command | Scaffold already copies the newest kit, so every *new* project is current. Only already-built sites would need upgrade, and those are rarely reopened. Build it only if someone asks. |
| Lighthouse in generated projects | Too slow. Developers would delete it. |

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| C1 | Generator only — generated code has no `@dewdie/*` dependency | Agency sites get redesigned per client. A shared package would be forked or escape-hatched constantly. |
| C2 | Output is a folder inside an existing repo, beside `backend/` | This is how Tanasoft client projects are laid out. |
| C3 | Published to public npm as `@dewdie/landing-kit` | Zero setup for developers. Source becomes readable — accepted knowingly. The `dewdie` org was created on npmjs.com on 2026-08-14, so the scope is owned and any name under it is available. |
| C4 | CLI lives in this repo, not a separate one or a workspace split | What gets published is the same tree `pnpm verify` proves. No template copy can drift. |
| C5 | Locales are never asked. Every site is `mn` + `en`, `mn` unprefixed | Bilingual routing is the kit's point and the hardest thing to retrofit. A choice here invites a regret. |
| C6 | Client details are left as placeholders, not prompted | Faster scaffold. The one dangerous placeholder is guarded by a build check (see §7). |
| C7 | `/docs` reference page is copied, with removal instructions | It is the fastest way for a developer to see every block and token. It is `noindex`, absent from the sitemap, and never prerendered, so it costs visitors nothing. |
| C8 | The CLI runs no `pnpm install` and no `git init` | Those are the developer's to run, and running them silently is surprising. |
| C9 | Comments across the kit get shortened | Current comments are long and dense. They should be short, plain, and only where the code is surprising. |
| C10 | `src/shell/` is dissolved into `src/components/` + `src/lib/`, and the import alias changes `~/` → `@/` | Coworkers know React + Vite, not TanStack Start. This is the layout they already know, and it is what `components.json` is already configured for. Must land *before* the CLI, which hardcodes paths. **Done — Plan 3a, merged into `main` 2026-08-14.** |

## 4. What the CLI asks

Four questions, plus one per selected block that has more than one layout:

```
? Pages    › Multi-page / One-page
? Theme    › Light + dark / Single
? Preset   › editorial / warm
? Blocks   › ◉ hero ◉ features ◉ cta ◉ contact
? hero     › centered / split
```

Every question has a flag, and `--yes` takes all defaults. So a developer can be guided,
and a documented one-liner can be pasted into a README.

Defaults: multi-page, light + dark, `editorial`, all four blocks, each block's
`defaultVariant`.

## 5. What lands in `frontend/`

**Copied unchanged from the kit:**

- `src/components/` — layout primitives, header, footer, theme toggle, page and block renderers
- `src/lib/` — SEO, page resolution, shared types
- `src/styles/` — including only the chosen preset
- `src/blocks/` — only the selected block folders, plus `variant-registry.ts`
- `src/routes/`, `src/client.tsx`, `src/server.ts`, `src/router.tsx`, `src/routeTree.gen.ts`
- The boundary files for the chosen answers: `motion.animated.tsx` or `motion.noop.tsx`,
  `theme.both.tsx` or `theme.single.tsx`, one of `submit.rpc.ts` / `submit.endpoint.ts` —
  plus `motion.types.ts`, `theme.types.ts` and `submit-schema.ts`, which both sides need
- `vite.config.ts`, `tsconfig.json`, `biome.json`, `components.json`, `tsr.config.json`
- `scripts/check-conventions.mjs`, `scripts/verify-build.mjs`
- `public/`
- `README.md`

**Written fresh by the CLI:**

| File | Contents |
|---|---|
| `package.json` | Folder name, scripts, and the exact versions the kit is tested against — read from the kit's own `devDependencies` at runtime, so drift is impossible |
| `pnpm-workspace.yaml` | `allowBuilds` for esbuild and lightningcss, plus the `typescript` override. Without it, pnpm 10 silently skips build scripts and the site breaks confusingly |
| `src/blocks/registry.ts` | Lists the selected blocks. Cannot be copied — it names every block by hand, so a subset scaffold would import folders that were never written |
| `src/blocks/block-modules.ts` | Same reason: one dynamic import per selected block |
| `src/blocks/variants.all.ts` | Same reason: registers every selected block for the server |
| `src/config/pages.config.ts` | Pages and blocks from the answers, with each chosen variant |
| `src/config/site.config.ts` | Placeholders for client name, domain, email, phone, address |
| `.kit/scaffold.json` | Kit version and the answers given. Enables `add-block` later |

**Never copied:** the `cli/` folder, `docs/`, `.superpowers/`, `configs/smoke-onepage/`,
`lighthouserc.json`, `lighthouserc.desktop.json`.

**Never edited outside `frontend/`**, with one exception: if the repo root has a
`pnpm-workspace.yaml` that lists `packages:`, the CLI appends `frontend` to that list.
A `pnpm-workspace.yaml` without a `packages:` key is pnpm configuration, not a workspace,
and is left alone.

## 6. What a developer runs afterwards

```bash
cd frontend
pnpm install
pnpm dev
```

Their checks, all fast:

| Command | Time |
|---|---|
| `pnpm lint` | ~1s |
| `pnpm typecheck` | ~3s |
| `pnpm conventions` | ~1s |
| `pnpm build` | ~5s |
| `pnpm verify` | all of the above plus `verify-build` |

No Lighthouse. The performance guarantee is proved once in this repo, before publishing,
and every generated site inherits it.

## 7. Changes needed in this repo

**This one came first, before any CLI work** (C10) — **DONE, Plan 3a, merged 2026-08-14.**
Kept below as the record of what was required. Two things it added that the CLI must respect:
`src/lib/` is asserted `.tsx`-free by `check-conventions.mjs`, and the Biome
`noRestrictedImports` guard now covers `src/components/**` and `src/routes/**` as well as
`src/blocks/**`. Both travel with the copied files, so a generated project inherits them.

0. ~~**Make the project look like a normal React + Vite project.**~~

   ```
   src/shell/chrome/header.tsx      → src/components/header.tsx
   src/shell/chrome/footer.tsx      → src/components/footer.tsx
   src/shell/layout/*               → src/components/layout/*
   src/shell/theme/*                → src/components/theme-*.tsx
   src/shell/blocks/render-blocks   → src/components/render-blocks.tsx
   src/shell/pages/page-view.tsx    → src/components/page-view.tsx
   src/shell/docs/*                 → src/components/docs/*
   src/shell/seo/*                  → src/lib/seo/*
   src/shell/pages/{enumerate,resolve-link,resolve-request} → src/lib/pages/*
   src/shell/types.ts               → src/lib/types.ts
   ```

   Rule for the split: if it renders JSX it goes in `components/`, otherwise `lib/`.
   Both folders are what `components.json` already points shadcn at, so `shadcn add button`
   lands in the right place instead of creating a second home for components.

   Then change the import alias from `~/` to `@/` — in `tsconfig.json` `paths` (including the
   three boundary aliases `~/motion`, `~/theme`, `~/submit`), `vite.config.ts`,
   `components.json`, and every import in `src/`.

   Also update the paths hardcoded in `scripts/check-conventions.mjs` (it exempts
   `src/shell/layout/section.tsx` and `container.tsx` from the layout rules), in
   `scripts/verify-build.mjs`, in the `@source` globs in `src/styles/theme.css`, in the Biome
   `noRestrictedImports` boundary rule, and in `README.md`.

   Nothing about behaviour changes. `pnpm verify`, both smoke builds and Lighthouse must all
   produce the same results as before, and the built CSS should be byte-identical.

Then the CLI work:

1. **Add `cli/`** — plain `.mjs`, matching `scripts/`. No build step, no TypeScript compile.
2. **Add `"bin": { "landing-kit": "./cli/index.mjs" }`** to `package.json`.
3. **Remove `"private": true`** and add a LICENSE, so npm accepts the package. Also add
   `"publishConfig": { "access": "public" }` — scoped packages publish as private by
   default, and the first `npm publish` fails with a payment error without it.
4. **Move `react`, `react-dom`, `vite`, `tailwindcss` and the rest of the app packages into
   `devDependencies`.** They are what this repo needs to build and verify the kit, not what
   someone needs to run the generator. Anything left in `dependencies` gets downloaded by
   every `pnpm dlx`. This will look wrong to a reader, so it needs a one-line comment.
5. **Add a `"files"` list** so `docs/` and `.superpowers/` never reach npm.
6. **Never add a `prepare` script.** With one, npm installs devDependencies before running,
   which means downloading React and Vite just to copy files.
7. **New check in `verify-build.mjs`:** fail if `site.url` still holds the placeholder
   domain. A wrong domain is invisible on the page but poisons every canonical URL,
   hreflang tag and sitemap entry.
8. **Make the `/docs` `noindex` check conditional** in `check-conventions.mjs`: if
   `src/routes/docs.tsx` exists it must carry the tag; if the developer deleted it, pass.
   Today the check demands the file, so a fresh scaffold with `/docs` removed fails.
9. **Add a README section: removing the `/docs` page.** Delete `src/routes/docs.tsx` and
   `src/components/docs/`. Nothing else — item 8 makes that sufficient.
10. ~~**Shorten comments across the kit**~~ (C9) — **DONE, Plan 3a.** Developers read this code, and so does an AI
    assistant helping them. Rules: say it in one or two lines; only comment where the code is
    surprising; delete anything that repeats what the code already says. Worst offenders
    today are `src/blocks/registry.ts` (a ten-line comment on type contravariance, above a
    four-line object), `src/blocks/variants.all.ts` and `src/blocks/block-modules.ts`. Keep
    the *facts* that were expensive to learn — for example, why `<Link>` is banned, and why
    block modules resolve before hydration — just state them briefly.

## 8. Publishing

One-time setup: **done** — the `dewdie` organization was created on npmjs.com on 2026-08-14.

Then, manually to start:

```bash
# bump "version" in package.json
npm publish
```

`npm publish` packs the working tree, not the last commit. During Plan 2 a verification run
rewrote `package.json` and `pnpm-lock.yaml` on its own, so publishing an unchecked tree is a
live risk here. Rule: `git status` must be clean and `pnpm verify` green before publishing.

Move to a GitHub Action on tag once it has been published twice by hand and the shape is
known. CI publishes from a clean checkout, which removes the risk above.

## 9. How this is verified

No test framework, consistent with the rest of the kit. Verification is running the thing
and looking at the result.

1. **Scaffold into a temp directory and run the generated project's own gate.** `pnpm install
   && pnpm verify` must pass inside the generated `frontend/`. This is the main test: the
   generated project proves itself with the same checks the kit uses.
2. **Both page shapes.** Multi-page must prerender 4 pages, one-page must prerender 2.
3. **Both presets** must build, and the generated CSS must differ between them.
4. **A subset of blocks.** Scaffold with only `hero` and `contact`. It must build, and
   `pages.config.ts` must not reference blocks that were not copied.
5. **Removing `/docs`.** Delete the two paths, then `pnpm verify` must still pass.
6. **The placeholder guard.** `pnpm verify` must fail on a fresh scaffold's untouched
   `site.config.ts`, and pass once the domain is filled in. This assertion must be watched
   failing before it is trusted — a standing rule on this project, which has caught real
   defects.
7. **The real command, on a second machine — Tengis does this after publishing.** `pnpm dlx
   @dewdie/landing-kit@latest frontend` from a published version, not a local path. Local
   testing cannot prove the published package contains the right files. This is the one
   check that catches a wrong `files` list, and it cannot be done before publishing, so it
   sits outside the build.
8. **Lighthouse, once, in this repo** before publishing. Thresholds unchanged: mobile ≥ 0.85,
   desktop ≥ 0.95, both hard failures.

## 10. Risks

- **Public source.** Anyone can read and copy the blocks, SEO layer and presets. Chosen
  knowingly. The `files` list keeps plans and specs out, but the code itself is readable.
- **A wrong `files` list ships a broken package.** If a needed file is missing from the
  list, the CLI copies a file that is not there — and it fails for developers, not for us,
  because our local tree has everything. Verification item 7 is the only thing that catches
  this, so it is not optional.
- **`.kit/scaffold.json` records answers that later drift.** A developer who hand-adds a
  block makes the file wrong. It is a record of what was generated, not of current state,
  and `add-block` must treat it that way.

## 11. After this

1. **`add-block`** — copy a block into an existing project and register it. Needs to edit
   `variants.all.ts`, `block-modules.ts` and `pages.config.ts`. The TypeScript AST tooling
   in `check-conventions.mjs` is the starting point.
2. **`upgrade`** — only if someone asks for it. The tractable shape: generate the diff
   between the recorded kit version and the target, and apply it with `git apply --3way`,
   so git's merge does the work and conflicts appear as ordinary git conflicts.
3. **Content engine, analytics** — unchanged from the foundation spec.
