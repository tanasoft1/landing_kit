import type { ReactNode } from 'react'

const WIDTH = {
  page: 'max-w-page',
  narrow: 'max-w-narrow',
} as const

// A prop, not a `className="ml-0"`/`className="mr-auto"` override at the call site: `mx-auto`
// and `mr-auto` are both margin utilities whose precedence depends on Tailwind's internal CSS
// ordering, not on the order classes are written in — an override would work right up until it
// silently didn't.
const ALIGN = {
  center: 'mx-auto',
  start: 'mr-auto',
} as const

export function Container({
  width = 'page',
  align = 'center',
  className = '',
  children,
}: {
  width?: keyof typeof WIDTH
  /**
   * `'center'` (default) centres the container — the only behaviour any call site saw before
   * this prop existed, since it's additive. `'start'` left-aligns it instead, for a narrower-
   * than-page column that should share a left edge with a sibling `width="page"` Container
   * under the same `<Section>` (e.g. a block's narrow intro next to its page-width body).
   */
  align?: keyof typeof ALIGN
  className?: string
  children: ReactNode
}) {
  // `align="start"` on anything narrower than the page needs a shared reference frame, not just
  // `mr-auto` on its own box. `mr-auto` alone hugs the LEFT of this container's *immediate*
  // parent (the `<Section>`, full viewport width) — which only happens to match a sibling
  // `width="page"` Container's own left edge at viewports narrower than `max-w-page` (68rem),
  // where that sibling's `mx-auto` has no slack to centre with. Past `max-w-page`, the page
  // sibling centres itself with a margin this narrow box would never get on its own, reopening
  // the exact misalignment this prop exists to close (measured: a 96px gap at a 1280px
  // viewport). So: establish the identical page-width box first (`max-w-page`, `mx-auto`, one
  // `px-gutter` — the same box every `width="page"` Container renders), then cap the visible
  // content to `width`'s own measure, unpadded, inside it — still one `px-gutter` total, applied
  // by the outer box only.
  //
  // Every other combination — including the existing `width="narrow"`, default `align="center"`
  // used by the contact block — renders the original single `<div>`, byte-for-byte unchanged, so
  // this prop is purely additive for every call site that predates it.
  if (align === 'start' && width !== 'page') {
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
