import type { ReactNode } from 'react'

const WIDTH = {
  page: 'max-w-page',
  narrow: 'max-w-narrow',
} as const

// A prop, not a `className="ml-0"` override at the call site: `mx-auto`/`mr-auto` precedence
// depends on Tailwind's internal CSS ordering, not the order classes are written in — an
// override would work right up until it silently didn't.
const ALIGN = {
  center: 'mx-auto',
  start: 'mr-auto',
} as const

type Width = keyof typeof WIDTH
type Align = keyof typeof ALIGN

/**
 * `align="start"` is unavailable on `width="page"` by type, not by runtime guard: "left edge of
 * the page grid" only means something on a container narrower than the grid. Looked like a
 * harmless no-op once — it isn't. `mr-auto` alone shoves a `max-w-page` box against the
 * *viewport* edge (measured: 192px of slack at 1280px), so allowing it on `width="page"` would
 * make one prop mean two different things depending on a sibling prop.
 */
type ContainerProps = { className?: string; children: ReactNode } & (
  | {
      width?: 'page'
      /** Not available at `width="page"`: the page grid IS the reference frame. */
      align?: 'center'
    }
  | {
      width: Exclude<Width, 'page'>
      /**
       * `'start'` shares a left edge with a sibling `width="page"` Container. It renders two
       * nested boxes (outer page-width + inner capped to `width`) instead of one, so
       * `className` lands on the **inner** box, not the outer — put a class meant for the outer
       * box on the enclosing `<Section>` instead.
       */
      align?: Align
    }
)

export function Container(props: ContainerProps) {
  const { width = 'page', className = '', children } = props
  // Unreachable through `ContainerProps`, kept as a runtime floor for a `.jsx` consumer or `as`
  // cast that delivers the forbidden pair anyway. Degrading to `center` is the safe fallback.
  const align: Align = width === 'page' ? 'center' : (props.align ?? 'center')
  // `mr-auto` alone only matches a sibling `width="page"` Container's left edge below the page
  // width (68rem); past that, the sibling centres with margin this box never gets, reopening the
  // misalignment `align="start"` exists to close (measured: 96px gap at 1280px). So build the
  // identical page-width outer box first, then cap the visible content to `width` inside it.
  // Every other combination is the original single `<div>`, unchanged — this prop is additive.
  if (align === 'start') {
    return (
      <div className="w-full px-gutter mx-auto max-w-page">
        <div className={`${ALIGN[align]} ${WIDTH[width]} ${className}`}>{children}</div>
      </div>
    )
  }
  return (
    <div className={`w-full px-gutter ${ALIGN[align]} ${WIDTH[width]} ${className}`}>
      {children}
    </div>
  )
}
