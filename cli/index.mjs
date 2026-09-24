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

// The package root. Under `pnpm dlx` this is the unpacked tarball, never the user's own tree.
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
  --theme=both|light|dark    Toggle, or pin one palette      (default: both)
  --preset=editorial|warm    Token preset                    (default: editorial)
  --backend=none|api|admin   Static site, +Go service,       (default: none)
                             +admin panel for reading leads
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

/** `pnpm fix` is listed only when the new files were not formatted (before `pnpm install`). */
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

/**
 * The steps printed at the end. For `admin` they cover Postgres, `.env`, the API and
 * `make seed-admin`, which prompts for the password. Migrations run at startup, so there is no
 * migrate step. `make run`, not `make dev`, because `air` is optional.
 */
function nextSteps(answers) {
  const backend = answers.backend ?? 'none'
  const lines = [`  cd ${answers.dir}`, '  pnpm install']

  if (backend === 'none') {
    lines.push('  pnpm dev')
  } else {
    lines.push(
      '  cp api/.env.example api/.env',
      '  docker compose up -d db          # Postgres, on host port 5433',
      '  (cd api && make run)             # the API on :3000 — migrations run at startup',
      '  pnpm dev                         # the site on :5173',
    )
  }

  const notes = []
  if (backend === 'admin') {
    notes.push(
      '',
      '  Create the first admin account — there is no sign-up screen:',
      '',
      '    cd api && make seed-admin email=you@example.mn',
      '',
      '  It prompts for the password with echo off; there is no `password=` to pass, on',
      '  purpose. Minimum 12 characters. Then open /admin and sign in.',
    )
  }
  if (backend !== 'none') {
    // Absolute for `api`, which goes through CORS. Relative for `admin`, which is same-origin.
    const admin = backend === 'admin'
    notes.push(
      '',
      '  The contact form posts nowhere until you point it at the service. In a .env at',
      '  the project root:',
      '',
      `    VITE_CONTACT_ENDPOINT=${admin ? '/api/leads' : 'http://localhost:3000/api/leads'}`,
      '',
      admin
        ? '  Relative, because your vite.config.ts proxies /api to :3000 in development and'
        : '  Absolute, because the site and the API are separate origins and the form reaches',
      admin
        ? '  the Go binary serves the site and the API together in production.'
        : '  the service through CORS. api/README.md covers that side.',
    )
  }

  return [
    '',
    ...lines,
    ...notes,
    '',
    '  Then set `url` in src/config/site.config.ts to your real domain.',
    '  `pnpm verify` fails until you do.',
    '',
  ].join('\n')
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
  // Check each block's `requires.blocks` against its copy before asking anything, so the prompt
  // never offers a combination the CLI then rejects.
  const blockDeps = readBlockDeps(KIT_ROOT)

  const answers = await resolveAnswers(process.argv, blockDeps)
  const outDir = resolve(process.cwd(), answers.dir)
  const kitVersion = readKitVersion(KIT_ROOT)

  // Reject answers that can't build before anything is written.
  assertBlockLinksResolve(KIT_ROOT, answers)

  // Checked before the first write, so a failure in `generateFiles` can roll the target back.
  const preexisting = existsSync(outDir)
  const written = copyKit(KIT_ROOT, outDir, answers)
  try {
    written.push(...generateFiles(KIT_ROOT, outDir, answers, kitVersion))
  } catch (err) {
    rollbackTarget(outDir, preexisting, err)
    throw err
  }

  // Last, and outside the rollback: this is the only edit outside the target directory.
  const workspace = registerInWorkspace(outDir)

  console.log(`\n✓ Created ${answers.dir}/ — ${written.length} files`)
  if (workspace.message) console.log(workspace.message)
  console.log(nextSteps(answers))
  // Listed one per line: these are the only files holding placeholder text nobody wrote.
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
