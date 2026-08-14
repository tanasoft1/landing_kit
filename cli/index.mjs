#!/usr/bin/env node
import { parseArgs, resolveAnswers } from './prompts.mjs'

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
  console.log(JSON.stringify(answers, null, 2))
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}\n`)
  process.exit(1)
})
