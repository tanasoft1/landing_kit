import { createInterface } from 'node:readline/promises'
import { blockNameProblem } from './add.mjs'
import { isInteractive, runCheckbox, runRadio } from './select.mjs'

/** The single layout a scaffold-time custom block is born with. `add-block` can add more later. */
export const CUSTOM_VARIANT = 'simple'

export const BLOCK_ORDER = ['hero', 'features', 'cta', 'contact']
export const BLOCK_VARIANTS = {
  hero: ['centered', 'split'],
  features: ['grid', 'alternating'],
  cta: ['banner', 'split'],
  contact: ['default'],
}
export const BLOCK_DEFAULT_VARIANT = {
  hero: 'centered',
  features: 'grid',
  cta: 'banner',
  contact: 'default',
}

// The four single-choice questions. Order here is the order they are asked in.
const CHOICES = {
  pages: ['multi', 'one'],
  theme: ['both', 'light', 'dark'],
  preset: ['editorial', 'warm'],
  // 'none' first because it is the default. 'admin' last: the panel needs the API, so the
  // options are levels, not peers.
  backend: ['none', 'api', 'admin'],
}
const DEFAULTS = { pages: 'multi', theme: 'both', preset: 'editorial', backend: 'none' }
const LABELS = { pages: 'Pages', theme: 'Theme', preset: 'Preset', backend: 'Backend' }

// One short line per choice, shown beside it in the picker.
const HINTS = {
  multi: 'Home and Contact as separate pages',
  one: 'Everything on a single page',
  both: 'Light and dark, with a toggle',
  light: 'Light only, no toggle',
  dark: 'Dark only, no toggle',
  editorial: 'Quiet and neutral, small radius',
  warm: 'Amber and rounder, with a soft shadow',
  none: 'Static site only',
  api: 'Go service and Postgres, stores contact form submissions',
  admin: 'The API plus an admin panel for reading leads',
}

const VARIANT_HINTS = {
  hero: { centered: 'Text centred, no image', split: 'Text beside an image' },
  features: { grid: 'Cards in a grid', alternating: 'Rows, image side alternating' },
  cta: { banner: 'Full-width band', split: 'Two columns' },
}

const BLOCK_HINTS = {
  hero: 'The opening section',
  features: 'What you offer',
  cta: 'A call to action',
  contact: 'Contact form',
}

// --- blocks of your own ---------------------------------------------------------------------------
// New names typed at the block question become real block folders with placeholder copy.

const ADD_ITEM = {
  label: 'add your own',
  hint: 'a section the kit has no copy for (pricing, faq, …)',
  prompt: 'name',
  addedHint: 'yours — placeholder text to replace',
  validateNew: (name, taken) => customBlockProblem(name, taken),
}

/** The reason `name` cannot be a new block, or null. One message for the flag and the picker. */
function customBlockProblem(name, taken) {
  const problem = blockNameProblem(name)
  if (problem !== null) return problem
  if (BLOCK_ORDER.includes(name)) {
    return `'${name}' is a built-in block already — pick it from the list, don't add it.`
  }
  if (taken.includes(name)) return `'${name}' has already been added.`
  return null
}

/** `--add-blocks=pricing,faq`, validated exactly as the typed-in names are. */
function parseCustomBlocks(raw, label = '--add-blocks') {
  const given = raw.split(',').map((s) => s.trim())
  if (given.length === 1 && given[0] === '') return []
  const out = []
  for (const name of given) {
    if (name === '') throw new Error(`Invalid ${label} '${raw}'. It has an empty entry.`)
    const problem = customBlockProblem(name, out)
    if (problem !== null) throw new Error(`Invalid ${label}: ${problem}`)
    out.push(name)
  }
  return out
}

const withHints = (values, hints) => values.map((value) => ({ value, hint: hints?.[value] }))

export function parseArgs(argv) {
  const args = argv.slice(2)
  // Null prototype, so `--toString` or `--__proto__` isn't mistaken for a known flag.
  const flags = Object.create(null)
  let dir = null
  const set = (name, value) => {
    if (Object.hasOwn(flags, name)) throw new Error(`Flag --${name} was given more than once`)
    flags[name] = value
  }
  for (const a of args) {
    if (a === '--yes' || a === '-y') set('yes', true)
    else if (a === '--help' || a === '-h') set('help', true)
    else if (a === '--') throw new Error("'--' is not a flag. Options look like --preset=warm")
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq === -1) throw new Error(`Flag needs a value: ${a} (use ${a}=value)`)
      const name = a.slice(2, eq)
      if (name === '') throw new Error(`Missing flag name: ${a} (options look like --preset=warm)`)
      // `--yes=true` would otherwise be the string 'true', and the CLI would start prompting.
      if (name === 'yes' || name === 'help') {
        throw new Error(`Flag --${name} takes no value: ${a} (write --${name} on its own)`)
      }
      set(name, a.slice(eq + 1))
    } else if (a.startsWith('-')) {
      // Never fall through to the positional: `-Y` would become the target directory name.
      throw new Error(`Unknown flag ${a}. The only short flags are -y (--yes) and -h (--help)`)
    } else if (dir === null) dir = a
    else throw new Error(`Unexpected argument: ${a}`)
  }
  return { dir, flags, yes: flags.yes === true, help: flags.help === true }
}

// A misspelled flag name is an error, like a misspelled value.
function checkFlagNames(flags) {
  for (const name of Object.keys(flags)) {
    if (name === 'yes' || name === 'help' || Object.hasOwn(CHOICES, name)) continue
    if (name === 'blocks' || name === 'add-blocks') continue
    if (name.startsWith('variant-')) continue
    throw new Error(
      `Unknown flag --${name}. Allowed: --pages, --theme, --preset, --backend, --blocks, ` +
        '--add-blocks, --variant-<block>, --yes, --help',
    )
  }
}

function checkChoice(name, value) {
  if (!CHOICES[name].includes(value)) {
    throw new Error(`Invalid --${name} '${value}'. Allowed: ${CHOICES[name].join(', ')}`)
  }
  return value
}

// Returns the list sorted into BLOCK_ORDER. `label` only changes the error wording.
function parseBlocks(raw, label = '--blocks') {
  const given = raw.split(',').map((s) => s.trim())
  if (given.length === 1 && given[0] === '') {
    throw new Error(
      `Invalid ${label} '${raw}'. At least one block is required. ` +
        `Allowed: ${BLOCK_ORDER.join(', ')}`,
    )
  }
  for (const id of given) {
    // `hero,,contact` is a typo, not a two-block list — dropping the gap hides it.
    if (id === '') {
      throw new Error(
        `Invalid ${label} '${raw}'. It has an empty entry. ` + `Allowed: ${BLOCK_ORDER.join(', ')}`,
      )
    }
    if (!BLOCK_ORDER.includes(id)) {
      throw new Error(`Invalid ${label} entry '${id}'. Allowed: ${BLOCK_ORDER.join(', ')}`)
    }
  }
  return BLOCK_ORDER.filter((id) => given.includes(id))
}

function variantFlagNames(flags) {
  return Object.keys(flags).filter((name) => name.startsWith('variant-'))
}

function checkVariantFlags(flags) {
  for (const name of variantFlagNames(flags)) {
    const block = name.slice('variant-'.length)
    if (!BLOCK_ORDER.includes(block)) {
      throw new Error(
        `Invalid flag --${name}: '${block}' is not a block. ` +
          `Allowed: ${BLOCK_ORDER.join(', ')}`,
      )
    }
    const value = flags[name]
    if (!BLOCK_VARIANTS[block].includes(value)) {
      throw new Error(`Invalid --${name} '${value}'. Allowed: ${BLOCK_VARIANTS[block].join(', ')}`)
    }
  }
}

function checkVariantFlagsMatchBlocks(flags, blocks) {
  for (const name of variantFlagNames(flags)) {
    const block = name.slice('variant-'.length)
    if (!blocks.includes(block)) {
      throw new Error(
        `--${name} was given, but '${block}' is not one of the selected blocks ` +
          `(${blocks.join(', ')})`,
      )
    }
  }
}

// `rl.question()` never settles if stdin ends first. Reject on close so that is an error.
function ask(rl, query) {
  return new Promise((resolve, reject) => {
    const onClose = () => reject(new Error('Input ended before every question was answered'))
    rl.once('close', onClose)
    rl.question(query).then(
      (answer) => {
        rl.off('close', onClose)
        resolve(answer)
      },
      (err) => {
        rl.off('close', onClose)
        reject(err)
      },
    )
  })
}

async function askChoice(rl, label, choices, fallback) {
  for (;;) {
    const answer = (await ask(rl, `? ${label} (${choices.join('/')}) [${fallback}]: `)).trim()
    if (answer === '') return fallback
    if (choices.includes(answer)) return answer
    console.log(`  '${answer}' is not one of: ${choices.join(', ')}`)
  }
}

/** The arrow-key equivalent, opened on the default so Enter alone still takes it. */
const pickChoice = (label, choices, fallback, hints) =>
  runRadio({
    title: label,
    options: withHints(choices, hints),
    initialIndex: Math.max(0, choices.indexOf(fallback)),
  })

// --- block dependencies at the prompt ------------------------------------------------------------
// Some blocks' copy links to other blocks. The flag path errors on a bad set; the prompt refuses
// it and asks again.

/** The `[selected block, block it needs]` pairs the selection is missing. Empty means buildable. */
function missingBlockDeps(blocks, blockDeps) {
  const missing = []
  for (const id of blocks) {
    for (const dep of blockDeps[id] ?? []) {
      if (!blocks.includes(dep)) missing.push([id, dep])
    }
  }
  return missing
}

/** Same rule as `askBlocks`, checked live so an unbuildable set can't be confirmed. */
const blockValidator = (blockDeps) => (selected) => {
  // At least one built-in block: your own blocks have placeholder copy and no nav entry.
  if (!selected.some((id) => BLOCK_ORDER.includes(id))) {
    return ['Pick at least one of the blocks the kit ships.']
  }
  const missing = missingBlockDeps(selected, blockDeps)
  if (missing.length === 0) return null
  return missing.map(([id, dep]) => `'${id}' links to '${dep}', so '${dep}' must be selected too.`)
}

const pickBlocks = (blockDeps, offerAdd = true) =>
  runCheckbox({
    title: 'Blocks',
    options: withHints(BLOCK_ORDER, BLOCK_HINTS),
    initialChecked: [...BLOCK_ORDER],
    validate: blockValidator(blockDeps),
    // Hidden when `--add-blocks` already answered it.
    addItem: offerAdd ? ADD_ITEM : null,
  })

/** Splits one picker answer into the kit's blocks and the ones typed in, each in list order. */
const splitBlocks = (selected) => ({
  blocks: selected.filter((id) => BLOCK_ORDER.includes(id)),
  custom: selected.filter((id) => !BLOCK_ORDER.includes(id)),
})

async function askBlocks(rl, blockDeps) {
  const fallback = BLOCK_ORDER.join(',')
  for (;;) {
    const answer = (await ask(rl, `? Blocks (comma-separated) [${fallback}]: `)).trim()
    let blocks
    try {
      blocks = answer === '' ? [...BLOCK_ORDER] : parseBlocks(answer, 'blocks')
    } catch (err) {
      console.log(`  ${err.message}`)
      continue
    }
    const missing = missingBlockDeps(blocks, blockDeps)
    if (missing.length === 0) return blocks
    // One line per pair, so it's clear which block to drop.
    for (const [id, dep] of missing) {
      console.log(`  '${id}' links to '${dep}', so '${dep}' must be selected too.`)
    }
    console.log(
      `  You chose: ${blocks.join(', ')}. Add the missing block, or drop the one needing it.`,
    )
  }
}

/** The typed equivalent of the picker's `add your own` row: a second question, same rules. */
async function askCustomBlocks(rl) {
  for (;;) {
    const answer = (
      await ask(rl, '? Blocks of your own (comma-separated names, blank for none): ')
    ).trim()
    if (answer === '') return []
    try {
      return parseCustomBlocks(answer, 'blocks of your own')
    } catch (err) {
      console.log(`  ${err.message}`)
    }
  }
}

/**
 * `blockDeps` is `readBlockDeps(KIT_ROOT)`. It needs an array for every id in BLOCK_ORDER: a
 * missing id would silently turn the dependency check off for that block.
 */
export async function resolveAnswers(argv, blockDeps) {
  const badDeps = BLOCK_ORDER.filter((id) => !Array.isArray(blockDeps?.[id]))
  if (badDeps.length > 0) {
    throw new Error(
      'resolveAnswers needs the block dependency map from readBlockDeps(): an array for every ' +
        `block. Missing or not an array for: ${badDeps.join(', ')}`,
    )
  }
  const { dir, flags, yes } = parseArgs(argv)
  // An unset shell variable gives `''`, which would scaffold over the repo root.
  if (dir === null || dir.trim() === '') {
    throw new Error('A target directory is required. Usage: landing-kit <dir> [options]')
  }

  // Check every flag before asking anything, so a typo shows up at once.
  checkFlagNames(flags)
  for (const name of Object.keys(CHOICES)) {
    if (flags[name] !== undefined) checkChoice(name, flags[name])
  }
  if (flags.blocks !== undefined) parseBlocks(flags.blocks)
  if (flags['add-blocks'] !== undefined) parseCustomBlocks(flags['add-blocks'])
  checkVariantFlags(flags)

  // One input mode per run: readline and the raw-mode picker can't share stdin. Without a TTY
  // (pipes, CI, `--yes`) the prompts are typed.
  const interactive = isInteractive()

  let rl = null
  const prompt = () => {
    if (rl === null) rl = createInterface({ input: process.stdin, output: process.stdout })
    return rl
  }

  try {
    // Trimmed: `"  frontend  "` is a quoting slip, not a folder name with spaces.
    const answers = { dir: dir.trim() }
    for (const name of Object.keys(CHOICES)) {
      if (flags[name] !== undefined) answers[name] = flags[name]
      else if (yes) answers[name] = DEFAULTS[name]
      else if (interactive) {
        answers[name] = await pickChoice(LABELS[name], CHOICES[name], DEFAULTS[name], HINTS)
      } else {
        answers[name] = await askChoice(prompt(), LABELS[name], CHOICES[name], DEFAULTS[name])
      }
    }

    const customFlag =
      flags['add-blocks'] === undefined ? null : parseCustomBlocks(flags['add-blocks'])

    // In a terminal, one picker takes both built-in and new blocks. Flags and pipes ask twice.
    if (interactive && flags.blocks === undefined && !yes) {
      const picked = splitBlocks(await pickBlocks(blockDeps, customFlag === null))
      answers.blocks = picked.blocks
      answers.custom = customFlag ?? picked.custom
    } else {
      if (flags.blocks !== undefined) answers.blocks = parseBlocks(flags.blocks)
      else if (yes) answers.blocks = [...BLOCK_ORDER]
      // The flag path is deliberately NOT checked here: `assertBlockLinksResolve` refuses it in
      // cli/index.mjs, reading the copy files themselves rather than a declaration about them.
      else answers.blocks = await askBlocks(prompt(), blockDeps)

      if (customFlag !== null) answers.custom = customFlag
      // Flags mean a scripted run: a question nobody typed an answer to would hang it.
      else if (yes || flags.blocks !== undefined) answers.custom = []
      else answers.custom = await askCustomBlocks(prompt())
    }

    checkVariantFlagsMatchBlocks(flags, answers.blocks)

    answers.variants = {}
    for (const block of answers.blocks) {
      const flag = flags[`variant-${block}`]
      const variants = BLOCK_VARIANTS[block]
      // A block with one layout has nothing to ask — a question with a single possible answer.
      if (flag !== undefined) answers.variants[block] = flag
      else if (variants.length === 1) answers.variants[block] = variants[0]
      else if (yes) answers.variants[block] = BLOCK_DEFAULT_VARIANT[block]
      else if (interactive) {
        answers.variants[block] = await pickChoice(
          `${block} layout`,
          variants,
          BLOCK_DEFAULT_VARIANT[block],
          VARIANT_HINTS[block],
        )
      } else {
        answers.variants[block] = await askChoice(
          prompt(),
          block,
          variants,
          BLOCK_DEFAULT_VARIANT[block],
        )
      }
    }
    // Not asked: a new block has one layout.
    for (const block of answers.custom) answers.variants[block] = CUSTOM_VARIANT

    return answers
  } finally {
    if (rl !== null) rl.close()
  }
}
