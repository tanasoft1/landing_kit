import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import { FadeIn } from '@/motion'
import type { HeroCopy } from './copy.mn'

export function HeroSplit({
  copy,
  resolve,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<HeroCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <div className="grid items-center gap-10 md:grid-cols-2">
          <FadeIn>
            <p className="text-primary text-sm font-semibold tracking-wide uppercase">
              {copy.eyebrow}
            </p>
            <H className="mt-3 text-display font-bold text-balance">{copy.heading}</H>
            <p className="text-muted-foreground mt-5 text-lead text-pretty">{copy.lead}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={resolve(copy.primaryCta.target)}
                className="bg-primary text-primary-foreground rounded-base px-6 py-3 font-medium"
              >
                {copy.primaryCta.label}
              </a>
              <a
                href={resolve(copy.secondaryCta.target)}
                className="border-border rounded-base border px-6 py-3 font-medium"
              >
                {copy.secondaryCta.label}
              </a>
            </div>
          </FadeIn>
          {copy.image ? (
            // FadeIn, not Reveal: this image is above the fold and carries fetchPriority="high",
            // so it is this variant's LCP candidate. Reveal only animates once an intersection
            // callback fires, and the largest element on screen should not wait on that.
            <FadeIn>
              <img
                src={copy.image.src}
                alt={copy.image.alt}
                width={copy.image.width}
                height={copy.image.height}
                fetchPriority="high"
                className="rounded-base w-full h-auto"
              />
            </FadeIn>
          ) : null}
        </div>
      </Container>
    </Section>
  )
}
