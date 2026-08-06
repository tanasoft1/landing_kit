import { Reveal } from '~/motion'
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'
import type { BlockProps } from '~/shell/types'
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
        <Reveal className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {copy.items.map((item) => (
            <div key={item.title}>
              <h3 className="text-h3 font-semibold">{item.title}</h3>
              <p className="text-muted-foreground mt-2 text-pretty">{item.body}</p>
            </div>
          ))}
        </Reveal>
      </Container>
    </Section>
  )
}
