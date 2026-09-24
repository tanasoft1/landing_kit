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
  /** Fallback OG image path for pages without their own `ogImage`. */
  ogImageDefault: string
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
  /** `both`: light and dark with a header toggle, following the OS. `light`/`dark`: one palette, no toggle. */
  theme: { mode: 'light' | 'dark' | 'both' }
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
  surface: Surface
  /** Unique per page: a repeated block gets `${id}-2`, and so on. */
  anchorId: string
  /**
   * 1 for the first block on the page, else 2. Render `<H>` where
   * `const H = headingLevel === 1 ? 'h1' : 'h2'`. A literal <h1> or <h2> fails check-conventions.
   */
  headingLevel: 1 | 2
}

export type BlockSchema<C> = (ctx: { copy: C; site: SiteConfig; page: PageConfig }) => JsonLdNode[]

// biome-ignore lint/suspicious/noExplicitAny: any is the only default that keeps keyof C usable unparameterized.
export type BlockManifest<C = any, V extends string = string> = {
  id: string
  // Names only, never components, so components stay code-split. Write it `as const`.
  variantNames: readonly V[]
  defaultVariant: V
  copy: Record<Locale, C>
  nav?: { labelKey: keyof C & string }
  schema?: BlockSchema<C>
  // Other blocks this block's copy links to. Each must be on some page, or rendering throws and
  // verify reports a missing <h1>. Check this before removing a block from a page.
  requires?: { blocks?: string[] }
}
