import type { ReactNode } from 'react'

export type Locale = 'mn' | 'en'
export type Surface = 'default' | 'muted' | 'accent'

export type JsonLdNode = Record<string, unknown>

export type Address = {
  country: string
  region?: string
  city?: string
  street?: string
  postalCode?: string
}

export type SiteConfig = {
  name: string
  url: string
  defaultLocale: Locale
  locales: Locale[]
  organization: {
    kind: 'Organization' | 'LocalBusiness'
    legalName?: string
    logo: string
    email?: string
    phone?: string
    address?: Address
    sameAs?: string[]
  }
  nav: { target: string }[]
  theme: { mode: 'light' | 'dark' | 'both'; default?: 'light' | 'dark' }
}

export type SeoCopy = { title: string; description: string; ogImage?: string }

export type BlockRef<Id extends string = string> =
  | Id
  | { id: Id; variant?: string; surface?: Surface }

export type PageConfig<Id extends string = string> = {
  id: string
  path: string
  blocks: BlockRef<Id>[]
  seo: Record<Locale, SeoCopy>
}

export type BlockProps<C> = {
  copy: C
  site: SiteConfig
  resolve: (target: string) => string
  /** Assigned by the renderer; the block hands it to its own <Section>. */
  surface: Surface
}

export type BlockSchema<C> = (ctx: { copy: C; site: SiteConfig; page: PageConfig }) => JsonLdNode[]

export type BlockManifest<C = any, V extends string = string> = {
  id: string
  variants: Record<V, (props: BlockProps<C>) => ReactNode>
  defaultVariant: V
  copy: Record<Locale, C>
  nav?: { labelKey: keyof C & string }
  schema?: BlockSchema<C>
  requires?: { npm?: string[]; ui?: string[] }
}
