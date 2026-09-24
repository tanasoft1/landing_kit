import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pages as onepagePages } from './configs/smoke-onepage/pages.config.ts'
import { site as onepageSite } from './configs/smoke-onepage/site.config.ts'
import { pages as defaultPages } from './src/config/pages.config.ts'
import { site as defaultSite } from './src/config/site.config.ts'
import { enumerateUrls } from './src/lib/pages/enumerate.ts'
import { emitSeoFiles } from './src/lib/seo/emit-plugin.ts'
import { OUT_DIR } from './src/lib/seo/out-dir.ts'

const animation = process.env.KIT_ANIMATION ?? 'on'
const submit = process.env.KIT_SUBMIT ?? 'endpoint'
const config = process.env.KIT_CONFIG ?? 'default'

// The `@/config` alias only reaches bundled app code. Prerendering and SEO read
// `pages`/`site` here, so this file branches on KIT_CONFIG too.
const pages = config === 'onepage' ? onepagePages : defaultPages
const site = config === 'onepage' ? onepageSite : defaultSite

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  // `src/lib/seo/block-preloads.ts` reads the manifest to modulepreload each page's block chunks.
  build: { manifest: true },
  // Makes development same-origin, like production. `credentials: 'same-origin'` needs that
  // to send the refresh cookie.
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000' },
    },
  },
  resolve: {
    alias: {
      '@/motion':
        animation === 'on'
          ? r('./src/integrations/motion.animated.tsx')
          : r('./src/integrations/motion.noop.tsx'),
      '@/theme':
        site.theme.mode === 'both'
          ? r('./src/integrations/theme.both.tsx')
          : r('./src/integrations/theme.single.tsx'),
      // Not `submit.server.ts`. TanStack Start refuses to bundle any `*.server.*` file for
      // the client, by filename alone.
      '@/submit':
        submit === 'server'
          ? r('./src/integrations/submit.rpc.ts')
          : r('./src/integrations/submit.endpoint.ts'),
      '@/config': config === 'onepage' ? r('./configs/smoke-onepage') : r('./src/config'),
      '@': r('./src'),
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // The entries live in `src/app/`, not `src/`, so each is named. Paths are relative to `src/`.
      router: { entry: './app/router.tsx', generatedRouteTree: './app/routeTree.gen.ts' },
      client: { entry: './app/client.tsx' },
      server: { entry: './app/server.ts' },
      prerender: {
        enabled: true,
        // Both false keeps /docs out of the build. Flip either and /docs gets prerendered.
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
        concurrency: 8,
      },
      pages: [
        ...enumerateUrls(pages, site).map((u) => ({
          path: u.path,
          prerender: { enabled: true, outputPath: u.outputPath },
        })),
        // Not in pages.config.ts, which would put /admin in the sitemap and nav.
        // The Go binary serves /admin/* from this file. Without it, admin URLs fall back to
        // the home page. The file holds the panel skeleton.
        { path: '/admin', prerender: { enabled: true, outputPath: '/admin/index.html' } },
      ],
    }),
    viteReact(),
    emitSeoFiles({ pages, site, outDir: OUT_DIR }),
  ],
})
