import type { BlockManifest } from '~/shell/types'
import { contact } from './contact/manifest'
import { cta } from './cta/manifest'
import { features } from './features/manifest'
import { hero } from './hero/manifest'

// `BlockManifest<any, any>` here is not "no type checking" — each manifest is precisely
// typed at its own definition site (e.g. `satisfies BlockManifest<HeroCopy, 'centered' | 'split'>`
// in ./hero/manifest.ts). This step only needs to prove every entry *is* a manifest; using
// `unknown` instead would collapse `keyof C` and break the `nav.labelKey` constraint. It exists
// only to derive `BlockId` below from the object's real keys — `registry`, further down, is the
// binding everything else imports.
const manifests = {
  hero,
  contact,
  features,
  cta,
  // `schema` is a property (not a method), so TS checks its function type contravariantly:
  // a manifest's `BlockSchema<HeroCopy>` would not be assignable to the `BlockSchema<unknown>`
  // that `BlockManifest<unknown, unknown>` demands, so every concrete manifest would fail this
  // `satisfies` check. (Components moved off this type entirely — see `variantNames` on
  // `BlockManifest` in `~/shell/types` and `~/blocks/block-modules.ts` — but `schema` keeps the
  // same problem alive.)
  // biome-ignore lint/suspicious/noExplicitAny: unknown breaks assignability here (see above); any stays bivariant.
} satisfies Record<string, BlockManifest<any, any>>

// Derived from the actual object keys, not hand-written as `'hero' | 'contact'`, so adding or
// removing a block can never let this union silently drift out of sync with the registry.
export type BlockId = keyof typeof manifests

// Re-declared as its own object literal (not `= manifests`) so `scripts/verify-build.mjs` — which
// statically scans the source text for `export const registry { ... }` and checks every
// `src/blocks/*` folder name appears inside it — can still find it; an alias/identifier here
// would make that check unable to locate the registry at all. Annotated explicitly as
// `Record<BlockId, BlockManifest<any, any>>` so the union-contravariance problem is widened once,
// here, rather than at every call site that indexes the registry (`render-blocks.tsx`,
// `json-ld.ts`): `registry[id]` for a `BlockId` union would otherwise resolve to a union of each
// block's *own* manifest type, and TS checks a union of function-typed properties (`schema`)
// contravariantly — the same bivariant-`any` problem as above, resurfacing at every call site
// instead of paying for it once, here.
// biome-ignore lint/suspicious/noExplicitAny: any stays bivariant here; unknown breaks assignability (see above).
export const registry: Record<BlockId, BlockManifest<any, any>> = {
  hero,
  contact,
  features,
  cta,
}
