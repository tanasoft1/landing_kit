import { Container } from '@/shell/layout/container'
import type { SiteConfig } from '@/shell/types'

export function Footer({ site }: { site: SiteConfig }) {
  const { organization: org } = site
  return (
    <footer className="border-border bg-muted border-t">
      <Container className="text-muted-foreground flex flex-wrap justify-between gap-4 py-10 text-sm">
        <p>
          © {site.name}
          {org.legalName ? ` · ${org.legalName}` : ''}
        </p>
        <p className="flex gap-4">
          {org.email ? <a href={`mailto:${org.email}`}>{org.email}</a> : null}
          {org.phone ? <a href={`tel:${org.phone.replace(/\s/g, '')}`}>{org.phone}</a> : null}
        </p>
      </Container>
    </footer>
  )
}
