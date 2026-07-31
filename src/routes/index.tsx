import { createFileRoute } from '@tanstack/react-router'
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <>
      <Section>
        <Container>
          <h1 className="text-[length:var(--text-display)] font-bold">Гарчиг / Heading</h1>
          <p className="text-muted-foreground mt-4 text-[length:var(--text-lead)]">
            Кирилл болон латин үсэг. Latin and Cyrillic.
          </p>
        </Container>
      </Section>
      <Section surface="muted">
        <Container>
          <h2 className="text-[length:var(--text-h2)] font-semibold">Second surface</h2>
        </Container>
      </Section>
    </>
  )
}
