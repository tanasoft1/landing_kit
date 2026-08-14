import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pages as onepagePages } from './configs/smoke-onepage/pages.config'
import { site as onepageSite } from './configs/smoke-onepage/site.config'
import { pages as defaultPages } from './src/config/pages.config'
import { site as defaultSite } from './src/config/site.config'
import { enumerateUrls } from './src/lib/pages/enumerate'
import { emitSeoFiles } from './src/lib/seo/emit-plugin'
import { OUT_DIR } from './src/lib/seo/out-dir'

const animation = process.env.KIT_ANIMATION ?? 'on'
const submit = process.env.KIT_SUBMIT ?? 'endpoint'
const config = process.env.KIT_CONFIG ?? 'default'

// The `@/config` alias below only affects app code bundled by Vite. This file itself drives
// prerendering (`tanstackStart({ pages: ... })`) and SEO emission from `pages`/`site` directly,
// so it must also branch on KIT_CONFIG here — otherwise a one-page config still prerenders the
// default config's routes and the alias swap is a dead letter for the build driver.
const pages = config === 'onepage' ? onepagePages : defaultPages
const site = config === 'onepage' ? onepageSite : defaultSite

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  // Read by `src/lib/seo/block-preloads.ts` at prerender time: `dist/client/.vite/manifest.json`
  // maps each block's `variants.ts` source module to its built chunk (and that chunk's own
  // static `imports`, which is how the shared `motion` chunk gets discovered too), so the
  // prerendered <head> can `modulepreload` exactly the chunks a given page's blocks need.
  build: { manifest: true },
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
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        // Both false is what keeps /docs (absent from pages.config.ts) out of prerendering —
        // flip either and it prerenders into dist/client with no other warning in the source.
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
    viteReact(),
    emitSeoFiles({ pages, site, outDir: OUT_DIR }),
  ],
})
