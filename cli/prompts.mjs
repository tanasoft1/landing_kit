import { createInterface } from 'node:readline/promises'

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
    if (name === 'yes' || name === 'help' || Object.hasOwn(CHOICES, name) || name === 'blocks')
      continue
    if (name.startsWith('variant-')) continue
    throw new Error(
      `Unknown flag --${name}. Allowed: --pages, --theme, --preset, --blocks, ` +
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

/**
 * `blockDeps` is `readBlockDeps(KIT_ROOT)` from generate.mjs — the dependency graph the manifests
 * declare, already reconciled against the copy files. Required, not defaulted: a missing argument
 * would leave `missingBlockDeps` finding nothing and silently turn the prompt guard off, which is
 * the one failure this whole mechanism exists to prevent.
 */
export async function resolveAnswers(argv, blockDeps) {
  if (blockDeps === null || typeof blockDeps !== 'object') {
    throw new Error('resolveAnswers needs the block dependency map from readBlockDeps()')
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
  checkVariantFlags(flags)

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
      else answers[name] = await askChoice(prompt(), LABELS[name], CHOICES[name], DEFAULTS[name])
    }

    if (flags.blocks !== undefined) answers.blocks = parseBlocks(flags.blocks)
    else if (yes) answers.blocks = [...BLOCK_ORDER]
    // The flag path is deliberately NOT checked here: `assertBlockLinksResolve` refuses it in
    // cli/index.mjs, reading the copy files themselves rather than a declaration about them.
    else answers.blocks = await askBlocks(prompt(), blockDeps)

    checkVariantFlagsMatchBlocks(flags, answers.blocks)

    answers.variants = {}
    for (const block of answers.blocks) {
      const flag = flags[`variant-${block}`]
      const variants = BLOCK_VARIANTS[block]
      // A block with one layout has nothing to ask — a question with a single possible answer.
      if (flag !== undefined) answers.variants[block] = flag
      else if (variants.length === 1) answers.variants[block] = variants[0]
      else if (yes) answers.variants[block] = BLOCK_DEFAULT_VARIANT[block]
      else {
        answers.variants[block] = await askChoice(
          prompt(),
          block,
          variants,
          BLOCK_DEFAULT_VARIANT[block],
        )
      }
    }

    return answers
  } finally {
    if (rl !== null) rl.close()
  }
}
