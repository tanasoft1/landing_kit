/**
 * Where the client build lands. Written once here, never repeated in the files that need it.
 *
 * This does not SET the output dir — `tanstackStart` does, and `dist/client` is its default.
 * This is how the rest of the kit FINDS that output. The two are matched by convention, and
 * `verify-build.mjs` fails loudly if they stop matching. Three files must agree:
 * `vite.config.ts`, `emit-plugin.ts` and `block-preloads.ts`.
 *
 * Its own module, not an export from `vite.config.ts`. `build-head.ts` imports
 * `block-preloads.ts`, and that is shared route code the client bundles too — importing
 * `vite.config.ts` from there pulls in `@tailwindcss/vite` and `@vitejs/plugin-react` and
 * breaks the client build. A plain string constant is safe on both sides.
 */
export const OUT_DIR = 'dist/client'
