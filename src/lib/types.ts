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

// `unknown` as C's default would make `keyof C` resolve to `never` for a bare `BlockManifest`
// reference, so `nav?: { labelKey: keyof C & string }` below could never be satisfied without
// the caller re-parameterizing C explicitly every time.
// biome-ignore lint/suspicious/noExplicitAny: any is the only default that keeps keyof C usable unparameterized.
export type BlockManifest<C = any, V extends string = string> = {
  id: string
  // Names only, not components: components live behind `src/blocks/block-modules.ts`'s dynamic
  // import so Vite can split them out of the main chunk. A manifest importing its own components
  // would put them right back on the static chain from `registry.ts` — see that file's header
  // comment. Declare this with `as const` on the array literal so a `defaultVariant` not in the
  // list stays a compile error.
  variantNames: readonly V[]
  defaultVariant: V
  copy: Record<Locale, C>
  nav?: { labelKey: keyof C & string }
  schema?: BlockSchema<C>
  requires?: { npm?: string[]; ui?: string[] }
}
