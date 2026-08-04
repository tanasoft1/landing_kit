import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pages } from './src/config/pages.config'
import { site } from './src/config/site.config'
import { enumerateUrls } from './src/shell/pages/enumerate'
import { emitSeoFiles } from './src/shell/seo/emit-plugin'

const animation = process.env.KIT_ANIMATION ?? 'on'
const submit = process.env.KIT_SUBMIT ?? 'endpoint'
const config = process.env.KIT_CONFIG ?? 'default'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

const OUT_DIR = 'dist/client'

export default defineConfig({
  resolve: {
    alias: {
      '~/motion': animation === 'on' ? r('./src/motion.animated.tsx') : r('./src/motion.noop.tsx'),
      '~/submit': submit === 'server' ? r('./src/submit.server.ts') : r('./src/submit.endpoint.ts'),
      '~/config': config === 'onepage' ? r('./configs/smoke-onepage') : r('./src/config'),
      '~': r('./src'),
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
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
