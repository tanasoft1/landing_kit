import { createFileRoute } from '@tanstack/react-router'
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <>
      <Section>
        <Container>
          <h1 className="text-display font-bold">Гарчиг / Heading</h1>
          <p className="text-muted-foreground text-lead mt-4">
            Кирилл болон латин үсэг. Latin and Cyrillic.
          </p>
        </Container>
      </Section>
      <Section surface="muted">
        <Container width="narrow">
          <h2 className="text-h2 font-semibold">Second surface, narrow measure</h2>
        </Container>
      </Section>
    </>
  )
}
