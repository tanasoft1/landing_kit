#!/usr/bin/env node
/**
 * Maintainer-only commands: the multi-config smoke builds and the Lighthouse budget runs.
 * `tools/` is not in `package.json` `files`, so none of this ships to users.
 *
 * Usage:  node tools/kit.mjs <command>
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Every command runs from the web app, because the bare `node` and `rm` steps can't use
// `pnpm --filter`.
const WEB = join(dirname(dirname(fileURLToPath(import.meta.url))), 'apps/web')

// Fetched per run, not installed: `@lhci/cli` pulls in old tmp, uuid, qs, js-yaml and extract-zip
// (no fixed extract-zip exists), which kept `pnpm audit` red.
const LHCI = ['dlx', '@lhci/cli@0.15.1', 'autorun']

const COMMANDS = {
  'smoke:full': {
    describe: 'Build the default config with animation and the server submit boundary',
    env: { KIT_CONFIG: 'default', KIT_ANIMATION: 'on', KIT_SUBMIT: 'server' },
    steps: [
      ['pnpm', ['exec', 'vite', 'build']],
      ['node', ['scripts/verify-build.mjs']],
    ],
  },
  'smoke:onepage': {
    describe: 'Build the one-page config with animation off and the endpoint submit boundary',
    env: { KIT_CONFIG: 'onepage', KIT_ANIMATION: 'off', KIT_SUBMIT: 'endpoint' },
    steps: [
      ['pnpm', ['exec', 'vite', 'build']],
      ['node', ['scripts/verify-build.mjs']],
    ],
  },
  lighthouse: {
    describe: 'Mobile performance budget (fails under the thresholds in lighthouserc.json)',
    env: {},
    steps: [
      ['rm', ['-rf', '.lighthouseci']],
      ['pnpm', ['build']],
      ['pnpm', LHCI],
    ],
  },
  'lighthouse:desktop': {
    describe: 'Desktop performance budget (lighthouserc.desktop.json)',
    env: {},
    steps: [
      ['rm', ['-rf', '.lighthouseci']],
      ['pnpm', ['build']],
      ['pnpm', [...LHCI, '--config=lighthouserc.desktop.json']],
    ],
  },
}

const name = process.argv[2]
const cmd = COMMANDS[name]

if (!cmd) {
  const width = Math.max(...Object.keys(COMMANDS).map((k) => k.length))
  console.error(
    `${name ? `Unknown command '${name}'.\n\n` : ''}Usage: node tools/kit.mjs <command>\n\n` +
      Object.entries(COMMANDS)
        .map(([k, v]) => `  ${k.padEnd(width)}  ${v.describe}`)
        .join('\n') +
      '\n',
  )
  process.exit(1)
}

for (const [bin, args] of cmd.steps) {
  const r = spawnSync(bin, args, {
    cwd: WEB,
    stdio: 'inherit',
    env: { ...process.env, ...cmd.env },
  })
  // Stop at the first failure, or verify would grade the previous build's output.
  if (r.status !== 0) process.exit(r.status ?? 1)
}
