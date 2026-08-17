#!/usr/bin/env node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyKit } from './copy.mjs'
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
  const written = copyKit(KIT_ROOT, outDir, answers)
  console.log(`\n✓ ${written.length} files written to ${answers.dir}/\n`)
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}\n`)
  process.exit(1)
})
