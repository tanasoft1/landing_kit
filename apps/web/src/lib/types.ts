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
  /** Root-relative path to the fallback OG image, used by pages with no own `ogImage`. */
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
  /**
   * `both` ships the light and dark palettes and a toggle in the header, opening on whatever
   * the visitor's operating system prefers. `light` and `dark` each pin the site to one palette
   * and ship no toggle and no theme-switching JavaScript at all.
   */
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
  /** Assigned by the renderer; the block hands it to its own <Section>. */
  surface: Surface
  /**
   * Assigned by the renderer; the block hands it to its own <Section id={...}>.
   * De-duplicated across repeated instances of the same block on one page
   * (first is the bare block id, a second becomes `${id}-2`, etc).
   */
  anchorId: string
  /**
   * Set by the renderer, never by the block, because a block cannot know if it opens the page.
   * The first block on a page gets `1` and owns the page's single <h1>. Every other block gets
   * `2`. A block with a heading writes `const H = headingLevel === 1 ? 'h1' : 'h2'` and renders
   * `<H>`. Never write a literal `<h1>` or `<h2>` — check-conventions rejects both, with no
   * exceptions, because the level is never the block's call.
   */
  headingLevel: 1 | 2
}

export type BlockSchema<C> = (ctx: { copy: C; site: SiteConfig; page: PageConfig }) => JsonLdNode[]

// `unknown` as C's default would make `keyof C` resolve to `never` for a bare `BlockManifest`,
// breaking `nav?: { labelKey: keyof C & string }` below unless every caller re-parameterizes C.
// biome-ignore lint/suspicious/noExplicitAny: any is the only default that keeps keyof C usable unparameterized.
export type BlockManifest<C = any, V extends string = string> = {
  id: string
  // Names only, never components. Components stay behind block-modules.ts's dynamic import so
  // Vite can split them out of the main chunk. Write the array `as const`, so a `defaultVariant`
  // that is not in the list stays a compile error.
  variantNames: readonly V[]
  defaultVariant: V
  copy: Record<Locale, C>
  nav?: { labelKey: keyof C & string }
  schema?: BlockSchema<C>
  // `blocks` lists the OTHER blocks this one's copy links to by `target`. Each of them must sit
  // on some page in `pages.config.ts`. If one does not, `createResolver`
  // (src/lib/pages/resolve-link.ts) throws while rendering, the page comes out blank, and
  // `pnpm verify` says "expected exactly 1 <h1>, found 0" without ever naming the link. So read
  // this list before removing a block from a page. A block linking to itself is not a
  // dependency: it is satisfied wherever the block is.
  requires?: { blocks?: string[] }
}
