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

type Width = keyof typeof WIDTH
type Align = keyof typeof ALIGN

/**
 * `align` means "left edge of the page grid", and that is only a meaningful thing to ask for on a
 * container narrower than the page grid — so the type makes `align="start"` unavailable on
 * `width="page"` rather than accepting it and doing something else.
 *
 * This was first recorded as a harmless no-op. It is not. `mr-auto` sets `margin-right: auto` with
 * `margin-left` at its initial `0`, so a `max-w-page` box with `align="start"` is shoved against
 * the left edge of the *viewport* — 192px of slack at 1280px, and more on a wider screen. One prop
 * name would then mean "left edge of the page grid" for `width="narrow"` and "left edge of the
 * viewport" for `width="page"`: two different behaviours, silently selected by a sibling prop.
 * That is a worse trap than a no-op, because the no-op reading is what a reader assumes.
 *
 * Expressed as a union rather than a runtime guard so the combination cannot be written at all.
 * `Exclude<Width, 'page'>` rather than a literal `'narrow'`, so a third width added to `WIDTH`
 * gets `align` support automatically and only `page` stays excluded.
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
       * `'center'` (default) centres the container — the only behaviour any call site saw before
       * this prop existed, since it's additive. `'start'` left-aligns it instead, for a narrower-
       * than-page column that should share a left edge with a sibling `width="page"` Container
       * under the same `<Section>` (e.g. a block's narrow intro next to its page-width body).
       *
       * **`align="start"` changes what `className` attaches to.** Every other combination renders
       * a single `<div>` that is both the padded box and the content box, and `className` lands on
       * it. `align="start"` renders two nested boxes — an outer page-width box carrying the gutter,
       * and an inner box capped to `width` — and `className` lands on the **inner** one, next to
       * the content.
       *
       * That is deliberate rather than an oversight, and it is the reason this is documented
       * instead of "fixed" by always using the outer element: the classes call sites actually pass
       * are content classes (`text-center`, `grid`, `flex`, `mt-14`). Moving `grid` or `flex` to
       * the outer box would lay out the inner box as a single grid/flex item rather than laying
       * out the content, which is never what the call site meant. Both targets are defensible for
       * some class; only one is defensible for the classes this kit passes. If you need a class on
       * the outer, page-width box under `align="start"`, put it on the enclosing `<Section>`.
       */
      align?: Align
    }
)

export function Container(props: ContainerProps) {
  const { width = 'page', className = '', children } = props
  // Unreachable through `ContainerProps`, and kept anyway as a runtime floor: a `.jsx` consumer,
  // a spread of a loosely-typed object, or an `as` cast can still deliver the forbidden pair, and
  // falling through with it would apply `mr-auto` to a `max-w-page` box — precisely the left-shove
  // the type above exists to prevent. Degrading to `center` is the safe reading.
  const align: Align = width === 'page' ? 'center' : (props.align ?? 'center')
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
  // No `&& width !== 'page'` here any more: `align` is normalised above, so it can only be
  // `'start'` when `width` is narrower than the page.
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
