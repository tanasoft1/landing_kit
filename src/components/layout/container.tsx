import type { ReactNode } from 'react'

const WIDTH = {
  page: 'max-w-page',
  narrow: 'max-w-narrow',
} as const

// A prop, not a `className="ml-0"` override at the call site. Which of `mx-auto` and `mr-auto`
// wins depends on Tailwind's own CSS order, not the order you write the classes in, so an
// override works until one day it quietly does not.
const ALIGN = {
  center: 'mx-auto',
  start: 'mr-auto',
} as const

type Width = keyof typeof WIDTH
type Align = keyof typeof ALIGN

/**
 * The types block `align="start"` on `width="page"`, rather than a runtime check. "Left edge of
 * the page grid" only means something on a container narrower than that grid. It looks like a
 * harmless no-op, but it is not: on a `max-w-page` box, `mr-auto` pushes it against the
 * *viewport* edge instead (measured: 192px of slack at 1280px). Allowing it would make one prop
 * mean two different things.
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
       * `'start'` lines this box up with the left edge of a sibling `width="page"` Container. It
       * renders two nested boxes instead of one: an outer page-width box, and an inner one
       * capped to `width`. `className` lands on the **inner** box, because call sites pass
       * content classes like `grid`, `flex` or `mt-14`, and on the outer box `grid` would lay
       * out the inner box instead of the content. Classes meant for the outer box belong on the
       * surrounding `<Section>`.
       */
      align?: Align
    }
)

export function Container(props: ContainerProps) {
  const { width = 'page', className = '', children } = props
  // The types already rule this out. Kept for a `.jsx` caller or an `as` cast that passes the
  // forbidden pair anyway; falling back to `center` is the safe answer.
  const align: Align = width === 'page' ? 'center' : (props.align ?? 'center')
  // `mr-auto` on its own only matches the sibling's left edge below the page width (68rem).
  // Wider than that, the sibling centres and gains margin this box never gets, which reopens the
  // very gap `align="start"` exists to close (measured: 96px at 1280px). So build the same
  // page-width outer box first, then cap the content to `width` inside it. Every other
  // combination stays the original single `<div>` — this prop only ever adds.
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
