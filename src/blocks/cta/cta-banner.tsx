import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import { Reveal } from '@/motion'
import type { CtaCopy } from './copy.mn'

export function CtaBanner({ copy, resolve, surface, anchorId, headingLevel }: BlockProps<CtaCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container width="narrow" className="text-center">
        <Reveal>
          <H className="text-h2 font-semibold text-balance">{copy.heading}</H>
          <p className="text-muted-foreground text-lead mt-4 text-pretty">{copy.lead}</p>
          <a
            href={resolve(copy.primaryCta.target)}
            className="bg-primary text-primary-foreground rounded-base mt-8 inline-flex min-h-11 items-center px-7 py-3 font-medium"
          >
            {copy.primaryCta.label}
          </a>
        </Reveal>
      </Container>
    </Section>
  )
}
