/**
 * Where the client build lands — one definition, imported by everything that needs it rather than
 * restated in each place.
 *
 * This does not *set* the output directory; `tanstackStart` does, and `dist/client` is its
 * default. This constant is what the rest of the kit uses to FIND that output, so it has to agree
 * with it. Changing this alone moves the readers and writers below without moving Vite, which is
 * a mismatch `verify-build.mjs` catches loudly (`missing prerendered file …`) rather than
 * silently — but it is worth knowing that the two are coupled by convention, not derivation.
 *
 * It has three consumers that must agree: `vite.config.ts` (which hands it to `emitSeoFiles`, so
 * `sitemap.xml`, `robots.txt` and `.kit/urls.json` are written into it), `emit-plugin.ts` (which
 * deletes `<outDir>/.vite` after prerendering), and `block-preloads.ts` (which reads
 * `<outDir>/.vite/manifest.json` at prerender time to work out each page's `modulepreload` set).
 * The last of those hardcoded the string `'dist/client/.vite/manifest.json'`, so changing the
 * output directory in `vite.config.ts` would have left it silently looking in the old place —
 * `loadManifest` treats a missing file as the normal `pnpm dev` case and returns `null`, so the
 * preloads would simply stop being emitted, with a green build and a waterfall regression visible
 * only in a Lighthouse run weeks later.
 *
 * Deliberately its own module rather than an `export` on `vite.config.ts`. `block-preloads.ts` is
 * reachable from `build-head.ts`, which is shared route code that Vite bundles for the client;
 * importing `vite.config.ts` from there drags `@tailwindcss/vite` and `@vitejs/plugin-react` into
 * the client build and fails it outright (measured — the build errors, after warning that `path`,
 * `fs/promises`, `node:fs` and `node:url` have been externalized for browser compatibility). A
 * bare string constant with no imports of its own is safe in both environments and makes the same
 * drift impossible.
 */
export const OUT_DIR = 'dist/client'
