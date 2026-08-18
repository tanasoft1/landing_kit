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

// The three single-choice questions. Order here is the order they are asked in.
const CHOICES = {
  pages: ['multi', 'one'],
  theme: ['both', 'single'],
  preset: ['editorial', 'warm'],
}
const DEFAULTS = { pages: 'multi', theme: 'both', preset: 'editorial' }
const LABELS = { pages: 'Pages', theme: 'Theme', preset: 'Preset' }

// One short line per choice, shown beside it in the arrow-key picker. Someone scaffolding their
// first site has no idea what `editorial` or `alternating` looks like, and the whole point of a
// picker over a typed answer is that the options can explain themselves.
const HINTS = {
  multi: 'Home and Contact as separate pages',
  one: 'Everything on a single page',
  both: 'Light and dark, with a toggle',
  single: 'One mode only, no toggle',
  editorial: 'Quiet and neutral, small radius',
  warm: 'Amber and rounder, with a soft shadow',
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
//
// The four above are the ones the kit ships copy and layouts for. A site that needs a pricing table
// or an FAQ needs a block that does not exist yet, and the answer used to be "scaffold first, then
// run add-block" — a second command, in a second place, that nobody reads about until later.
//
// So the block question takes new names too, as many as you like. Each one becomes a real block
// folder in the scaffold: same four files `add-block` writes, registered the same way, already on
// the home page — with placeholder copy, waiting for its text.

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
  // Null prototype on purpose: with a plain `{}`, `--toString=x` and `--__proto__=x` are inherited
  // or special, so an `in` check says they are known flags and the typo is silently accepted.
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
      // `--yes=true` would otherwise leave `yes` as the string 'true', so `yes === true` is false
      // and the CLI starts prompting — a flag-spelling mistake reported as a stdin problem.
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

// A misspelled flag NAME is the same failure as a misspelled flag value: the answer is silently a
// default and nothing says so. Both are errors.
function checkFlagNames(flags) {
  for (const name of Object.keys(flags)) {
    if (name === 'yes' || name === 'help' || Object.hasOwn(CHOICES, name)) continue
    if (name === 'blocks' || name === 'add-blocks') continue
    if (name.startsWith('variant-')) continue
    throw new Error(
      `Unknown flag --${name}. Allowed: --pages, --theme, --preset, --blocks, --add-blocks, ` +
        '--variant-<block>, --yes, --help',
    )
  }
}

function checkChoice(name, value) {
  if (!CHOICES[name].includes(value)) {
    throw new Error(`Invalid --${name} '${value}'. Allowed: ${CHOICES[name].join(', ')}`)
  }
  return value
}

// Returns the list re-sorted into BLOCK_ORDER, so no caller downstream has to sort or dedupe.
// `label` only changes the wording: the same parser serves the flag and the prompt.
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

// `rl.question()` never settles if stdin ends first — the process would then exit 0 having asked
// nothing and written nothing. Reject on close instead, so a truncated answer stream is an error.
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
//
// Blocks are NOT freely combinable: hero's and cta's copy link to other blocks by id, and a link to
// an unselected block throws during server rendering (see `assertBlockLinksResolve` in
// generate.mjs). `assertBlockLinksResolve` is the backstop and stays exactly as it is for the flag
// path — a wrong `--blocks` is a wrong command and deserves an error.
//
// A prompt is different. Accepting an answer and then failing four questions later is a worse
// experience than not accepting it, and the developer is right there to fix it. So the same fact,
// declared in the manifests as `requires.blocks` and reconciled against the copy by `readBlockDeps`,
// is enforced here: an unbuildable selection is refused at the question and the question re-asked.

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

/**
 * The same rule as `askBlocks`, enforced live instead of after the fact.
 *
 * `runCheckbox` refuses to submit while this returns lines, so an unbuildable set cannot be
 * confirmed at all — and the reason sits under the list the whole time you are choosing, rather
 * than appearing once the question has already closed.
 */
const blockValidator = (blockDeps) => (selected) => {
  // At least one BUILT-IN, not just at least one block. Blocks of your own are born with
  // placeholder copy and no nav entry, so a site made only of them is a page of lorem ipsum —
  // and the header would have nothing to link to.
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
    // Hidden when `--add-blocks` already answered it, so the row cannot collect names that are
    // then thrown away.
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
    // Named per pair, not as one lumped list: "hero and cta need contact and features" does not
    // say which to drop if you only wanted one of them.
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
 * `blockDeps` is `readBlockDeps(KIT_ROOT)` from generate.mjs — the dependency graph the manifests
 * declare, already reconciled against the copy files.
 *
 * Checked for a COMPLETE map, not merely for an object. `missingBlockDeps` reads `blockDeps[id] ??
 * []`, so any block the map omits silently has no dependencies and the guard is off for it — and
 * `{}` turns it off for every block while passing a `typeof === 'object'` test. That test was what
 * this function shipped with, and it admitted `{}`: the exact value this paragraph claimed to
 * reject. So the check now enforces what is actually required, which is what the caller is
 * promising: an array for every id in `BLOCK_ORDER`.
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
  // An unset shell variable makes this `''`, which would scaffold over the repo root instead of
  // into `frontend/`. Missing and empty are the same mistake and get the same message.
  if (dir === null || dir.trim() === '') {
    throw new Error('A target directory is required. Usage: landing-kit <dir> [options]')
  }

  // Everything a flag can be wrong about is checked before a single question is asked, so a typo
  // is reported immediately rather than after four prompts.
  checkFlagNames(flags)
  for (const name of Object.keys(CHOICES)) {
    if (flags[name] !== undefined) checkChoice(name, flags[name])
  }
  if (flags.blocks !== undefined) parseBlocks(flags.blocks)
  if (flags['add-blocks'] !== undefined) parseCustomBlocks(flags['add-blocks'])
  checkVariantFlags(flags)

  // One input mode for the whole run, decided once. Readline and the raw-mode picker both own
  // stdin while they are open, so alternating between them mid-run would have two readers racing
  // for the same keypress. Not a TTY — piped stdin, CI, `--yes` — means typed prompts, which is
  // also what keeps every scripted invocation behaving exactly as it did before.
  const interactive = isInteractive()

  let rl = null
  const prompt = () => {
    if (rl === null) rl = createInterface({ input: process.stdin, output: process.stdout })
    return rl
  }

  try {
    // Trimmed, not just tested for emptiness: `landing-kit "  frontend  "` is a shell quoting slip,
    // and storing it untrimmed creates a directory whose name really does have the spaces in it.
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

    // One picker answers both — ticking the kit's blocks and typing your own are the same question
    // in a terminal. Everywhere else they are two, because a flag or a piped line cannot be one.
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
    // Not asked: a block that does not exist yet has exactly one layout, and naming it here means
    // every block in `answers` has a variant, so nothing downstream needs a special case.
    for (const block of answers.custom) answers.variants[block] = CUSTOM_VARIANT

    return answers
  } finally {
    if (rl !== null) rl.close()
  }
}
