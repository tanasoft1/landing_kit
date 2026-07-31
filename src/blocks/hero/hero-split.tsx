import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'
import type { BlockProps } from '~/shell/types'
import type { HeroCopy } from './copy.mn'

export function HeroSplit({ copy, resolve, surface }: BlockProps<HeroCopy>) {
  return (
    <Section id="hero" surface={surface}>
      <Container>
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <p className="text-primary text-sm font-semibold tracking-wide uppercase">
              {copy.eyebrow}
            </p>
            <h1 className="mt-3 text-display font-bold text-balance">{copy.heading}</h1>
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
          </div>
          {copy.image ? (
            <img
              src={copy.image.src}
              alt={copy.image.alt}
              width={copy.image.width}
              height={copy.image.height}
              fetchPriority="high"
              className="rounded-base w-full h-auto"
            />
          ) : null}
        </div>
      </Container>
    </Section>
  )
}
