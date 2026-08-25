#!/usr/bin/env node
/**
 * Maintainer-only commands for the kit itself: the multi-config smoke builds and the Lighthouse
 * budget runs.
 *
 * These lived in `package.json` `scripts`, which ships inside the published tarball — so every
 * consumer's `node_modules` carried four commands that reference `configs/` and `lighthouserc*`,
 * neither of which is in `files`. Nothing ran them and nothing could: they were four broken
 * references presented as part of the package's interface.
 *
 * `tools/` is deliberately absent from `package.json`'s `files`, so this file does not ship.
 * That is the whole mechanism — there is no publish-time rewriting of `package.json`, which
 * would edit the working tree during `npm publish`, exactly what the README warns against
 *
 * Usage:  node tools/kit.mjs <command>
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Every command below drives the web app, which is no longer the repo root. `pnpm --filter`
// would work for the pnpm steps but not for the bare `node` and `rm` ones, so the whole step
// list runs with this as its cwd instead.
const WEB = join(dirname(dirname(fileURLToPath(import.meta.url))), 'apps/web')

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
      ['pnpm', ['exec', 'lhci', 'autorun']],
    ],
  },
  'lighthouse:desktop': {
    describe: 'Desktop performance budget (lighthouserc.desktop.json)',
    env: {},
    steps: [
      ['rm', ['-rf', '.lighthouseci']],
      ['pnpm', ['build']],
      ['pnpm', ['exec', 'lhci', 'autorun', '--config=lighthouserc.desktop.json']],
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
  // Stop at the first failure: the verify step after a failed build would report on stale output
  // from the previous run, which reads as a pass.
  if (r.status !== 0) process.exit(r.status ?? 1)
}
