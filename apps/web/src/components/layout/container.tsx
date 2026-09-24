import type { ReactNode } from 'react'

const WIDTH = {
  page: 'max-w-page',
  narrow: 'max-w-narrow',
} as const

// Use the `align` prop, not a className override. Tailwind's CSS order decides which margin wins.
const ALIGN = {
  center: 'mx-auto',
  start: 'mr-auto',
} as const

type Width = keyof typeof WIDTH
type Align = keyof typeof ALIGN

// align="start" is not allowed with width="page": it would pin the box to the viewport edge.
type ContainerProps = { className?: string; children: ReactNode } & (
  | {
      width?: 'page'
      align?: 'center'
    }
  | {
      width: Exclude<Width, 'page'>
      /**
       * `start` aligns with the left edge of a page-width Container. It renders two boxes, and
       * `className` goes on the inner one. Put outer-box classes on the surrounding <Section>.
       */
      align?: Align
    }
)

export function Container(props: ContainerProps) {
  const { width = 'page', className = '', children } = props
  // Runtime guard for callers that bypass the types.
  const align: Align = width === 'page' ? 'center' : (props.align ?? 'center')
  // A single box would drift from a page-width sibling on wide screens, so nest one inside a
  // page-width box.
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
