import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'

const animation = process.env.KIT_ANIMATION ?? 'on'
const submit = process.env.KIT_SUBMIT ?? 'endpoint'
const config = process.env.KIT_CONFIG ?? 'default'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '~/motion': animation === 'on' ? r('./src/motion.animated.tsx') : r('./src/motion.noop.tsx'),
      '~/submit': submit === 'server' ? r('./src/submit.server.ts') : r('./src/submit.endpoint.ts'),
      '~/config': config === 'onepage' ? r('./configs/smoke-onepage') : r('./src/config'),
      '~': r('./src'),
    },
  },
  plugins: [tailwindcss(), tanstackStart()],
})
