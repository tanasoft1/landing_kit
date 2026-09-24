/**
 * Arrow-key pickers: a radio list for one-of, a checkbox list for many-of. No dependencies, so
 * `pnpm dlx` stays safe. The logic is in pure functions so it can be tested without a terminal;
 * `runRadio` and `runCheckbox` only wire them to stdin and stdout.
 */

const ESC = '\x1b'

/**
 * One raw stdin chunk to a semantic key. A lone `ESC` never cancels the run: on some terminals it
 * starts a sequence whose other bytes haven't arrived yet.
 */
export function parseKey(chunk) {
  const s = String(chunk)
  if (s === `${ESC}[A` || s === 'k') return 'up'
  if (s === `${ESC}[B` || s === 'j') return 'down'
  if (s === '\r' || s === '\n') return 'enter'
  if (s === ' ') return 'space'
  if (s === '\x03') return 'sigint'
  if (s === '\x04') return 'eof'
  if (s === `${ESC}[H` || s === `${ESC}[1~`) return 'home'
  if (s === `${ESC}[F` || s === `${ESC}[4~`) return 'end'
  if (s === ESC) return 'escape'
  if (s === '\x7f' || s === '\b') return 'backspace'
  return 'other'
}

const wrap = (i, len) => (i + len) % len

/** `{ state, done }` — `done` means the caller should stop reading keys. */
export function radioNext(state, key) {
  const len = state.options.length
  switch (key) {
    case 'up':
      return { state: { ...state, index: wrap(state.index - 1, len) }, done: false }
    case 'down':
      return { state: { ...state, index: wrap(state.index + 1, len) }, done: false }
    case 'home':
      return { state: { ...state, index: 0 }, done: false }
    case 'end':
      return { state: { ...state, index: len - 1 }, done: false }
    case 'enter':
      return { state, done: true }
    default:
      return { state, done: false }
  }
}

/**
 * Text entry inside the checkbox list. `chunk` is the raw key, because `parseKey` maps `k`/`j` to
 * up/down. Enter on an empty box leaves text entry; Enter on a name adds it and stays open.
 */
function typingNext(state, key, chunk) {
  // Back to the top of the list, so Esc then Enter confirms instead of reopening the box.
  const stop = { ...state, typing: null, typingError: null, index: 0 }
  if (key === 'escape') return { state: stop, done: false }
  if (key === 'backspace') {
    return {
      state: { ...state, typing: state.typing.slice(0, -1), typingError: null },
      done: false,
    }
  }
  if (key === 'enter') {
    const name = state.typing.trim()
    if (name === '') return { state: stop, done: false }
    const taken = state.options.map((o) => o.value)
    const problem = state.addItem.validateNew(name, taken)
    if (problem !== null) return { state: { ...state, typingError: problem }, done: false }
    // Inserted before the `add` row, which stays last so it is always in the same place.
    const options = [
      ...state.options.slice(0, -1),
      { value: name, hint: state.addItem.addedHint },
      state.options[state.options.length - 1],
    ]
    const checked = new Set(state.checked).add(name)
    return { state: { ...state, options, checked, typing: '', typingError: null }, done: false }
  }
  // Printable ASCII only. Bad names are rejected on Enter with a reason, not ignored.
  if (typeof chunk === 'string' && /^[\x20-\x7e]$/.test(chunk)) {
    return { state: { ...state, typing: state.typing + chunk, typingError: null }, done: false }
  }
  return { state, done: false }
}

/**
 * Same as `radioNext`, plus Space to toggle and an optional `add` row. Enter completes only when
 * `state.error` is null, so an unbuildable selection can't be submitted.
 */
export function checkboxNext(state, key, chunk) {
  if (typeof state.typing === 'string') return typingNext(state, key, chunk)
  const len = state.options.length
  const current = state.options[state.index]
  switch (key) {
    case 'up':
      return { state: { ...state, index: wrap(state.index - 1, len) }, done: false }
    case 'down':
      return { state: { ...state, index: wrap(state.index + 1, len) }, done: false }
    case 'home':
      return { state: { ...state, index: 0 }, done: false }
    case 'end':
      return { state: { ...state, index: len - 1 }, done: false }
    case 'space': {
      // The `add` row is a button, not a choice: toggling it would put a row label into the answer.
      if (current.add) return { state: { ...state, typing: '', typingError: null }, done: false }
      const checked = new Set(state.checked)
      if (checked.has(current.value)) checked.delete(current.value)
      else checked.add(current.value)
      return { state: { ...state, checked }, done: false }
    }
    case 'enter':
      if (current.add) return { state: { ...state, typing: '', typingError: null }, done: false }
      return { state, done: state.error === null }
    default:
      return { state, done: false }
  }
}

// ASCII glyphs render the same in every terminal, including Windows consoles and CI logs.
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length))

function renderOptions(state, marker) {
  // The `add` row's label doesn't count toward the column width.
  const width = Math.max(...state.options.filter((o) => !o.add).map((o) => o.value.length))
  return state.options.map((o, i) => {
    const cursor = i === state.index ? '>' : ' '
    const hint = o.hint ? `  ${o.hint}` : ''
    return `${cursor} ${marker(state, o, i)} ${o.add ? o.value : pad(o.value, width)}${hint}`
  })
}

export function renderRadio(state) {
  const lines = [`? ${state.title}   (↑↓ move · Enter choose)`]
  lines.push(...renderOptions(state, (s, _o, i) => (i === s.index ? '(•)' : '( )')))
  return lines
}

export function renderCheckbox(state) {
  const typing = typeof state.typing === 'string'
  const header = typing
    ? `? ${state.title}   (type a name · Enter adds it · Esc when done)`
    : `? ${state.title}   (↑↓ move · Space toggle · Enter confirm)`
  const lines = [header]
  lines.push(
    ...renderOptions(state, (s, o) => (o.add ? ' + ' : s.checked.has(o.value) ? '[x]' : '[ ]')),
  )
  // The cursor character after the box is the only thing saying "your keystrokes land here".
  if (typing) lines.push(`    ${state.addItem.prompt}: ${state.typing}_`)
  if (typing && state.typingError) lines.push(`    ! ${state.typingError}`)
  if (state.error) for (const line of state.error) lines.push(`  ! ${line}`)
  return lines
}

/**
 * Drive a pure key-handler against the terminal. The cursor is restored in `finally`, even on a
 * throw. Ctrl-C exits the process, because raw mode swallows SIGINT.
 */
async function run(initial, next, render) {
  const { stdin, stdout } = process
  let state = initial
  let painted = 0

  const paint = () => {
    if (painted > 0) stdout.write(`${ESC}[${painted}A`)
    stdout.write(`${ESC}[0J`)
    const lines = render(state)
    stdout.write(`${lines.join('\n')}\n`)
    painted = lines.length
  }

  const wasRaw = stdin.isRaw === true
  stdin.setRawMode(true)
  stdin.resume()
  stdout.write(`${ESC}[?25l`)
  try {
    paint()
    for (;;) {
      const chunk = String(await once(stdin))
      const key = parseKey(chunk)
      if (key === 'sigint') {
        stdout.write(`${ESC}[?25h\n`)
        process.exit(130)
      }
      if (key === 'eof') throw new Error('Input ended before every question was answered')
      const step = next(state, key, chunk)
      state = step.state
      paint()
      if (step.done) return state
    }
  } finally {
    stdout.write(`${ESC}[?25h`)
    stdin.setRawMode(wasRaw)
    stdin.pause()
  }
}

/** One keypress. All three listeners are removed on every outcome, or they leak per keypress. */
const once = (stream) =>
  new Promise((resolve, reject) => {
    const done = () => {
      stream.off('data', onData)
      stream.off('end', onEnd)
      stream.off('error', onError)
    }
    const onData = (d) => {
      done()
      resolve(d)
    }
    const onEnd = () => {
      done()
      resolve('\x04')
    }
    const onError = (err) => {
      done()
      reject(err)
    }
    stream.once('data', onData)
    stream.once('end', onEnd)
    stream.once('error', onError)
  })

/** Both stdin and stdout must be terminals. Raw mode on a pipe throws or hangs. */
export const isInteractive = () =>
  process.stdin.isTTY === true &&
  process.stdout.isTTY === true &&
  typeof process.stdin.setRawMode === 'function'

export async function runRadio({ title, options, initialIndex = 0 }) {
  const state = await run({ title, options, index: initialIndex }, radioNext, renderRadio)
  return state.options[state.index].value
}

/**
 * `addItem` turns on the "type your own" row: `{ label, hint, prompt, addedHint, validateNew }`.
 * `validateNew(name, taken)` returns a reason to refuse, or null. Returns values in list order,
 * with typed-in items after the fixed options.
 */
export async function runCheckbox({
  title,
  options,
  initialChecked = [],
  validate = () => null,
  addItem = null,
}) {
  const withError = (s) => ({
    ...s,
    error: validate(s.options.filter((o) => !o.add && s.checked.has(o.value)).map((o) => o.value)),
  })
  const rows = addItem
    ? [...options, { value: addItem.label, hint: addItem.hint, add: true }]
    : options
  const initial = withError({
    title,
    options: rows,
    index: 0,
    checked: new Set(initialChecked),
    typing: null,
    typingError: null,
    addItem,
  })
  const state = await run(
    initial,
    (s, key, chunk) => {
      const step = checkboxNext(s, key, chunk)
      return {
        state: withError(step.state),
        done: step.done && withError(step.state).error === null,
      }
    },
    renderCheckbox,
  )
  // `state.options`, not the argument: typed-in items only exist on the final state.
  return state.options.filter((o) => !o.add && state.checked.has(o.value)).map((o) => o.value)
}
