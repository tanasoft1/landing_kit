import { ThemeToggle } from '@/theme'

const COLOR_TOKENS = [
  'background',
  'foreground',
  'muted',
  'muted-foreground',
  'accent',
  'border',
  'primary',
  'primary-foreground',
  'ring',
  'destructive',
  'success',
] as const

const TYPE_TOKENS = ['display', 'h2', 'h3', 'lead'] as const

// Tailwind's scanner only sees class names written out in full. `bg-${t}` is invisible to it
// and ships no CSS, so these lookups write each class as a literal string once, here. Typed as
// `Record<(typeof TOKENS)[number], string>` rather than `Record<string, string>`, so a token
// added above with no class here is a compile error instead of a blank swatch you find by eye.
const COLOR_SWATCH_CLASS: Record<(typeof COLOR_TOKENS)[number], string> = {
  background: 'bg-background',
  foreground: 'bg-foreground',
  muted: 'bg-muted',
  'muted-foreground': 'bg-muted-foreground',
  accent: 'bg-accent',
  border: 'bg-border',
  primary: 'bg-primary',
  'primary-foreground': 'bg-primary-foreground',
  ring: 'bg-ring',
  destructive: 'bg-destructive',
  success: 'bg-success',
}

const TYPE_SCALE_CLASS: Record<(typeof TYPE_TOKENS)[number], string> = {
  display: 'text-display',
  h2: 'text-h2',
  h3: 'text-h3',
  lead: 'text-lead',
}

export function TokenGallery() {
  return (
    <div className="grid gap-10">
      <div>
        <h3 className="text-h3 font-semibold">Colour</h3>
        {/*
          `DocsPage` renders no `<Header>`, so the toggle lives here instead, next to the
          swatches it changes. In a single-mode build `@/theme` resolves to `theme.single.tsx`,
          whose `ThemeToggle` renders `null` — so this adds no theme-switching code where there is none.
        */}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-muted-foreground text-sm">
            Rendered from the live CSS variables, for whichever preset is imported.
          </p>
          <ThemeToggle label="Toggle theme" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COLOR_TOKENS.map((t) => (
            <div key={t} className="border-border rounded-base border p-3">
              <div
                className={`${COLOR_SWATCH_CLASS[t]} border-border h-12 w-full rounded border`}
              />
              <code className="mt-2 block text-xs">--color-{t}</code>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-h3 font-semibold">Type scale</h3>
        <div className="mt-4 grid gap-4">
          {TYPE_TOKENS.map((t) => (
            <div key={t} className="border-border border-b pb-3">
              <code className="text-muted-foreground text-xs">text-{t}</code>
              <p className={`${TYPE_SCALE_CLASS[t]} mt-1`}>Сайн байна уу — The quick brown fox</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
