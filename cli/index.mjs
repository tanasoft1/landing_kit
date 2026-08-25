#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addBlock, addPage } from './add.mjs'
import { copyKit, rollbackTarget } from './copy.mjs'
import {
  assertBlockLinksResolve,
  generateFiles,
  readBlockDeps,
  readKitVersion,
  registerInWorkspace,
} from './generate.mjs'
import { parseArgs, resolveAnswers } from './prompts.mjs'

// The package root, one level up from `cli/`. Under `pnpm dlx` that is the unpacked tarball, so
// the kit being copied is always the published one — never anything in the user's own tree.
const KIT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

const HELP = `landing-kit — scaffold a bilingual landing site

Usage:  pnpm dlx @tanasoftllc/landing-kit@latest <dir> [options]

        Inside a project you already scaffolded:
          pnpm dlx @tanasoftllc/landing-kit add-block <name> [--variants=a,b]
          pnpm dlx @tanasoftllc/landing-kit add-page  <id> --blocks=a,b \\
                        --title-mn=".." --title-en=".."

        There is no bare "landing-kit" command: a generated project does not
        depend on this package, so nothing puts it on your PATH. "pnpm dlx"
        fetches and runs it.

Options:
  --pages=multi|one          Multi-page or one-page          (default: multi)
  --theme=both|single        Light + dark, or a single mode  (default: both)
  --preset=editorial|warm    Token preset                    (default: editorial)
  --backend=none|api         Static site, or +Go service     (default: none)
  --blocks=a,b,c             Blocks to include               (default: all four)
                             Not a free choice — see Blocks below
  --add-blocks=a,b           Blocks of your own, any number  (default: none)
                             Created empty, ready for your copy
  --variant-<block>=<name>   Layout for one block            (default: its own)
  -y, --yes                  Take every default, ask nothing
  -h, --help                 Show this

          In a terminal the questions are arrow-key pickers: up/down to move,
          Space to toggle a block, Enter to confirm. Piped or non-interactive
          input falls back to typed answers, so scripts and CI are unaffected.

Blocks:   hero (centered|split)  features (grid|alternating)
          cta (banner|split)     contact (default)

          Blocks are not independent — their copy links to each other, and a
          link to a block you left out makes the page render blank:
            hero  requires  contact
            cta   requires  contact, features
          8 of the 15 possible combinations are refused for this reason.

          The block list also takes names of your own: choose "add your own"
          in the picker, or pass --add-blocks. Each becomes a real block on
          the home page with placeholder copy for you to replace. At least
          one of the four above is still required.

Example:  pnpm dlx @tanasoftllc/landing-kit@latest frontend --yes
          pnpm dlx @tanasoftllc/landing-kit add-block testimonials
          pnpm dlx @tanasoftllc/landing-kit add-page about --blocks=features,cta \\
                        --title-mn="Бидний тухай" --title-en="About us"
`

/** `--flag=value` pairs from a subcommand's argv tail. Positional args are the caller's business. */
function subFlags(argv) {
  const out = {}
  for (const a of argv) {
    const m = /^--([\w-]+)=(.*)$/.exec(a)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const list = (v) =>
  v === undefined
    ? undefined
    : v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

/**
 * `pnpm fix` is only in the next steps when the new files were NOT formatted — which is the
 * pre-`pnpm install` case. Printing it unconditionally trains people to run a fix step that has
 * nothing to do, and hides the one time it matters.
 */
const verifyStep = (formatted) =>
  formatted.ran ? 'pnpm verify' : `pnpm fix && pnpm verify   (${formatted.why})`

/**
 * Subcommands run inside a generated project and never touch KIT_ROOT. Dispatched before
 * `parseArgs`, which would otherwise read `add-block` as the target directory name.
 */
function runSubcommand(cmd, argv) {
  const name = argv[3]
  const flags = subFlags(argv.slice(3))

  if (cmd === 'add-block') {
    if (!name || name.startsWith('-')) {
      throw new Error(
        'add-block needs a name: pnpm dlx @tanasoftllc/landing-kit add-block testimonials',
      )
    }
    const { written, edited, variants, formatted } = addBlock(
      name,
      list(flags.variants) ?? ['simple'],
    )
    console.log(`\n✓ Added block '${name}' (${variants.join(', ')})\n`)
    for (const f of written) console.log(`  created  ${f}`)
    for (const f of edited) console.log(`  updated  ${f}`)
    console.log(`
  Next:
    1. Write the copy — both languages — in src/blocks/${name}/copy.ts
    2. Put it on a page — add '${name}' to that page's \`blocks\` in src/config/pages.config.ts
       (or: pnpm dlx @tanasoftllc/landing-kit add-page <id> --blocks=${name})
    3. ${verifyStep(formatted)}
`)
    return
  }

  if (!name || name.startsWith('-')) {
    throw new Error(
      'add-page needs an id: pnpm dlx @tanasoftllc/landing-kit add-page about ' +
        '--blocks=features,cta --title-mn="Бидний тухай" --title-en="About us"',
    )
  }
  const { rel, path, blocks, placeholders, formatted } = addPage(name, {
    path: flags.path,
    blocks: list(flags.blocks),
    titleMn: flags['title-mn'],
    titleEn: flags['title-en'],
    descMn: flags['desc-mn'],
    descEn: flags['desc-en'],
  })
  console.log(`\n✓ Added page '${name}' at ${path} — ${blocks.join(', ')}\n`)
  console.log(`  updated  ${rel}`)
  console.log(`
  Next:
    1. ${
      placeholders
        ? `Replace the placeholder \`seo\` title and description for BOTH languages in\n       ${rel} — the titles currently end in '(mn)' and '(en)'`
        : `Check the \`seo\` title and description for both languages in ${rel}`
    }
    2. Change which sections the page shows: edit its \`blocks\` array in ${rel}
    3. To put it in the header menu, add { target: '${name}' } to \`nav\`
       in src/config/site.config.ts
    4. ${verifyStep(formatted)}

  Note: there is no new folder and no new route file — a page IS the entry above.
`)
}

async function main() {
  const cmd = process.argv[2]
  if (cmd === 'add-block' || cmd === 'add-page') {
    runSubcommand(cmd, process.argv)
    return
  }

  const { help } = parseArgs(process.argv)
  if (help) {
    console.log(HELP)
    return
  }
  // Before the first question, not just before the first write. This reconciles each block's
  // `requires.blocks` against the `target`s in its own copy files and throws if they disagree —
  // the prompt is about to offer or refuse combinations on the strength of that declaration, and a
  // declaration that has drifted from the copy would make it offer one the CLI then rejects.
  // Unconditional, so `--yes` and the flag path prove it too; those are the only paths CI runs.
  const blockDeps = readBlockDeps(KIT_ROOT)

  const answers = await resolveAnswers(process.argv, blockDeps)
  const outDir = resolve(process.cwd(), answers.dir)
  const kitVersion = readKitVersion(KIT_ROOT)

  // Before the copy layer, not inside the generate layer: this rejects the ANSWERS, and answers
  // that cannot produce a working site should never reach the point of creating a directory. With
  // this inside `generateFiles` the target held 60-odd copied files before the throw, and only the
  // rollback made that invisible — correct, but not what "refuses before anything is written" says.
  assertBlockLinksResolve(KIT_ROOT, answers)

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
  // Named one per line, because these are the only files in the whole scaffold that hold text
  // nobody wrote. Left unsaid, the placeholder headings ship.
  if (answers.custom.length > 0) {
    console.log(
      `  Your own blocks are on the home page with placeholder text. Write their copy in:`,
    )
    for (const id of answers.custom) console.log(`    src/blocks/${id}/copy.ts`)
    console.log('')
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}\n`)
  process.exit(1)
})
