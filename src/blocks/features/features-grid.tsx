import { Reveal } from '@/motion'
import { Container } from '@/shell/layout/container'
import { Section } from '@/shell/layout/section'
import type { BlockProps } from '@/shell/types'
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
            // `shadow-card` is the one place in the current block set that consumes
            // `--elevation-card` (see theme.css's `@theme inline` mapping): `none` on `editorial`,
            // a real soft shadow on `warm`. `bg-background` on a `muted`/`accent` section reads as
            // a card floating on the section surface; on a `default` section it's a hairline-only
            // card, since editorial's shadow is `none` and the background matches its container.
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
