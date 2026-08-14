import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import { Reveal } from '@/motion'
import type { CtaCopy } from './copy.mn'

export function CtaSplit({ copy, resolve, surface, anchorId, headingLevel }: BlockProps<CtaCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <Reveal className="grid items-center gap-8 md:grid-cols-2">
          <div>
            <H className="text-h2 font-semibold text-balance">{copy.heading}</H>
            <p className="text-muted-foreground text-lead mt-4 text-pretty">{copy.lead}</p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <a
              href={resolve(copy.primaryCta.target)}
              className="bg-primary text-primary-foreground rounded-base inline-flex min-h-11 items-center px-7 py-3 font-medium"
            >
              {copy.primaryCta.label}
            </a>
            {copy.secondaryCta ? (
              <a
                href={resolve(copy.secondaryCta.target)}
                className="border-border rounded-base inline-flex min-h-11 items-center border px-7 py-3 font-medium"
              >
                {copy.secondaryCta.label}
              </a>
            ) : null}
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
