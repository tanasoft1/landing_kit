/**
 * Where the client build lands — one definition, not restated in each consumer.
 *
 * Does not *set* the output dir; `tanstackStart` does (`dist/client` is its default). This is
 * what the rest of the kit uses to FIND that output, coupled by convention, not derivation —
 * `verify-build.mjs` catches a mismatch loudly, not silently. Three consumers must agree:
 * `vite.config.ts`, `emit-plugin.ts`, and `block-preloads.ts` (which used to hardcode
 * `'dist/client/.vite/manifest.json'` — a changed output dir would have left it silently
 * looking in the old place, since a missing manifest looks like the normal `pnpm dev` case).
 *
 * Its own module, not an `export` on `vite.config.ts`: `block-preloads.ts` is reachable from
 * `build-head.ts`, shared route code the client also bundles, and importing `vite.config.ts`
 * from there drags `@tailwindcss/vite`/`@vitejs/plugin-react` in and fails the client build
 * (measured). A bare string constant is safe in both environments.
 */
export const OUT_DIR = 'dist/client'
