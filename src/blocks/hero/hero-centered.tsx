import { FadeIn } from '@/motion'
import { Container } from '@/shell/layout/container'
import { Section } from '@/shell/layout/section'
import type { BlockProps } from '@/shell/types'
import type { HeroCopy } from './copy.mn'

export function HeroCentered({
  copy,
  resolve,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<HeroCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container className="text-center">
        <FadeIn>
          <p className="text-primary text-sm font-semibold tracking-wide uppercase">
            {copy.eyebrow}
          </p>
          <H className="mt-3 text-display font-bold text-balance">{copy.heading}</H>
          <p className="text-muted-foreground mx-auto mt-5 text-lead text-pretty">{copy.lead}</p>
        </FadeIn>
        <FadeIn delay={0.1} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={resolve(copy.primaryCta.target)}
            className="bg-primary text-primary-foreground rounded-base inline-flex min-h-11 items-center px-6 py-3 font-medium"
          >
            {copy.primaryCta.label}
          </a>
          <a
            href={resolve(copy.secondaryCta.target)}
            className="border-border rounded-base inline-flex min-h-11 items-center border px-6 py-3 font-medium"
          >
            {copy.secondaryCta.label}
          </a>
        </FadeIn>
      </Container>
    </Section>
  )
}
