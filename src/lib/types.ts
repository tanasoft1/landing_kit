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
  /**
   * Assigned by the renderer; the block hands it to its own <Section id={...}>.
   * De-duplicated across repeated instances of the same block on one page
   * (first is the bare block id, a second becomes `${id}-2`, etc).
   */
  anchorId: string
  /**
   * Assigned by the renderer, never chosen by the block: a block cannot know whether it opens
   * the page. The first block on a page gets `1` and owns the page's single <h1>; every other
   * block gets `2`. A block with a heading renders `const H = headingLevel === 1 ? 'h1' : 'h2'`
   * and uses `<H>`, never a literal `<h1>`/`<h2>` — check-conventions forbids the literal tags
   * outright, with no exceptions, because heading level is never the block's decision.
   */
  headingLevel: 1 | 2
}

export type BlockSchema<C> = (ctx: { copy: C; site: SiteConfig; page: PageConfig }) => JsonLdNode[]

// `unknown` as C's default would make `keyof C` resolve to `never` for a bare `BlockManifest`,
// breaking `nav?: { labelKey: keyof C & string }` below unless every caller re-parameterizes C.
// biome-ignore lint/suspicious/noExplicitAny: any is the only default that keeps keyof C usable unparameterized.
export type BlockManifest<C = any, V extends string = string> = {
  id: string
  // Names only, not components: components live behind block-modules.ts's dynamic import, so
  // Vite can split them from the main chunk. Use `as const` on the array so a `defaultVariant`
  // not in the list stays a compile error.
  variantNames: readonly V[]
  defaultVariant: V
  copy: Record<Locale, C>
  nav?: { labelKey: keyof C & string }
  schema?: BlockSchema<C>
  // `blocks` lists the OTHER blocks this one's copy links to by `target`. Selecting this block
  // without them ships a link to nothing: `createResolver` (src/lib/pages/resolve-link.ts) throws
  // during server rendering, the page prerenders blank, and `pnpm verify` reports "expected exactly
  // 1 <h1>, found 0" without ever naming the link. The scaffolding CLI reads this to keep such a
  // combination out of the interactive prompt. A block linking to itself is not a dependency.
  requires?: { npm?: string[]; ui?: string[]; blocks?: string[] }
}
