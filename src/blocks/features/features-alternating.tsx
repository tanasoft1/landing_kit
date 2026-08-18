import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import { Reveal } from '@/motion'
import type { FeaturesCopy } from './copy'

export function FeaturesAlternating({
  copy,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<FeaturesCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <H className="text-h2 font-semibold text-balance">{copy.heading}</H>
        <p className="text-muted-foreground text-lead mt-4 text-pretty">{copy.lead}</p>

        <div className="mt-16 grid gap-16">
          {copy.items.map((item, i) => (
            <Reveal key={item.title} className="grid items-center gap-8 md:grid-cols-2">
              <div className={i % 2 === 1 ? 'md:order-2' : undefined}>
                <h3 className="text-h3 font-semibold">{item.title}</h3>
                <p className="text-muted-foreground mt-3 text-pretty">{item.body}</p>
              </div>
              {item.image ? (
                <img
                  src={item.image.src}
                  alt={item.image.alt}
                  width={item.image.width}
                  height={item.image.height}
                  loading="lazy"
                  className="rounded-base w-full h-auto"
                />
              ) : (
                <div className="bg-muted rounded-base aspect-video w-full" aria-hidden="true" />
              )}
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  )
}
