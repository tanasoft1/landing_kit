import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import { Reveal } from '@/motion'
import type { FeaturesCopy } from './copy.mn'

export function FeaturesGrid({ copy, surface, anchorId, headingLevel }: BlockProps<FeaturesCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container width="narrow" align="start">
        <H className="text-h2 font-semibold text-balance">{copy.heading}</H>
        <p className="text-muted-foreground text-lead mt-4 text-pretty">{copy.lead}</p>
      </Container>
      <Container className="mt-14">
        <Reveal className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {copy.items.map((item) => (
            // `shadow-card` maps to `--elevation-card` (see the `@theme inline` block in
            // theme.css): `none` on editorial, a soft shadow on warm. On a `muted` or `accent`
            // section, `bg-background` reads as a floating card; on `default` it is just a
            // hairline, because editorial has no shadow.
            <div
              key={item.title}
              className="border-border bg-background rounded-base shadow-card border p-6"
            >
              <h3 className="text-h3 font-semibold">{item.title}</h3>
              <p className="text-muted-foreground mt-2 text-pretty">{item.body}</p>
            </div>
          ))}
        </Reveal>
      </Container>
    </Section>
  )
}
