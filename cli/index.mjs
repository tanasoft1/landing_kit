#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyKit, rollbackTarget } from './copy.mjs'
import { generateFiles, readKitVersion, registerInWorkspace } from './generate.mjs'
import { parseArgs, resolveAnswers } from './prompts.mjs'

// The package root, one level up from `cli/`. Under `pnpm dlx` that is the unpacked tarball, so
// the kit being copied is always the published one — never anything in the user's own tree.
const KIT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

const HELP = `landing-kit — scaffold a bilingual landing site

Usage:  pnpm dlx @dewdie/landing-kit@latest <dir> [options]

Options:
  --pages=multi|one          Multi-page or one-page          (default: multi)
  --theme=both|single        Light + dark, or a single mode  (default: both)
  --preset=editorial|warm    Token preset                    (default: editorial)
  --blocks=a,b,c             Blocks to include               (default: all four)
  --variant-<block>=<name>   Layout for one block            (default: its own)
  -y, --yes                  Take every default, ask nothing
  -h, --help                 Show this

Blocks:   hero (centered|split)  features (grid|alternating)
          cta (banner|split)     contact (default)

Example:  pnpm dlx @dewdie/landing-kit@latest frontend --yes
`

async function main() {
  const { help } = parseArgs(process.argv)
  if (help) {
    console.log(HELP)
    return
  }
  const answers = await resolveAnswers(process.argv)
  const outDir = resolve(process.cwd(), answers.dir)
  const kitVersion = readKitVersion(KIT_ROOT)

  // Read BEFORE the first write, and shared by both phases. `copyKit` proves the target empty and
  // rolls its own failures back; a failure in `generateFiles` would otherwise leave a target that
  // is complete enough to look finished and non-empty enough to block the next run — the same
  // wedge the copy layer's rollback exists to prevent, one layer up.
  const preexisting = existsSync(outDir)
  const written = copyKit(KIT_ROOT, outDir, answers)
  try {
    written.push(...generateFiles(KIT_ROOT, outDir, answers, kitVersion))
  } catch (err) {
    rollbackTarget(outDir, preexisting, err)
    throw err
  }

  // Last, after every other write has succeeded: this is the one edit outside the target
  // directory, so it must never happen for a run that then fails. It is deliberately outside the
  // rollback above — that is what "last" buys.
  const workspace = registerInWorkspace(outDir)

  console.log(`\n✓ Created ${answers.dir}/ — ${written.length} files`)
  if (workspace.message) console.log(workspace.message)
  console.log(`
  cd ${answers.dir}
  pnpm install
  pnpm dev

  Then set \`url\` in src/config/site.config.ts to your real domain.
  \`pnpm verify\` fails until you do.
`)
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}\n`)
  process.exit(1)
})
