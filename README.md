# Landing Kit

A bilingual (Mongolian + English) landing page, prerendered to static HTML.

You build a site by **editing config and copy files — not by rewriting components**. Everything
below is written to keep that true.

## Contents

- [Create your site](#create-your-site)
- [Running it](#running-it)
- [What you edit](#what-you-edit)
- [Adding a page](#adding-a-page)
- [Adding a block](#adding-a-block)
- [Adding a variant](#adding-a-variant)
- [Changing the design](#changing-the-design)
- [The contact form](#the-contact-form)
- [Fonts and Mongolian Cyrillic](#fonts-and-mongolian-cyrillic)
- [`/docs`: the live reference](#docs-the-live-reference)
- [Removing the /docs page](#removing-the-docs-page)
- [Rules the build enforces](#rules-the-build-enforces)
- [Gotchas](#gotchas)
- [Scripts](#scripts)
- [Scaffolding options](#scaffolding-options)
- [Working on the kit itself](#working-on-the-kit-itself)

## Create your site

Nothing to install first. Pick the line for your package manager and run it — `my-site` is the
folder it creates:

```bash
pnpm dlx @dewsoft/landing-kit@latest my-site     # pnpm
npx --yes @dewsoft/landing-kit@latest my-site    # npm
yarn dlx @dewsoft/landing-kit@latest my-site     # yarn 2+  (on yarn 1, use the npx line)
```

It asks four short questions. Use the **arrow keys** to move and **Enter** to choose — each option
explains itself, so there is nothing to memorise. For the blocks question, **Space** toggles items
on and off.

That question also has an **add your own** row. Choose it, type a name like `pricing`, press Enter,
and you get a real section of your own — as many as you like. Press Enter on an empty box when you
are done:

```
? Blocks   (↑↓ move · Space toggle · Enter confirm)
  [x] hero      The opening section
  [x] features  What you offer
  [x] cta       A call to action
  [x] contact   Contact form
  [x] pricing   yours — placeholder text to replace
> +   add your own  a section the kit has no copy for (pricing, faq, …)
```

Each one arrives on the home page with placeholder text, ready for you to write. You still need at
least one of the four the kit ships.

Every question opens on a sensible default, so pressing Enter four times is a valid run. Add
`--yes` to skip the questions entirely.

Then start it:

```bash
cd my-site
pnpm install      # or: npm install / yarn install
pnpm dev          # or: npm run dev / yarn dev
```

Open the address it prints. **Mongolian is at `/`, English at `/en`.**

Now go to [What you edit](#what-you-edit).

## Running it

Day to day you need two commands:

```bash
pnpm dev       # while you work
pnpm verify    # before you deploy — runs every check
```

Any package manager works. Swap `pnpm` for `npm run` or `yarn` throughout.

> **Do this before your first deploy:** open `src/config/site.config.ts` and change `url` to your
> real domain. `pnpm verify` refuses to pass until you do — a wrong domain does not show on the
> page, but it quietly breaks every link Google reads.

## What you edit

Two words explain the whole model:

- A **block** is one section of a page — hero, features, cta, contact.
- A **page** is just an ordered list of blocks.

### You don't need to know TanStack Start

This is built on TanStack Start, but you do not have to learn it to build a site. It does three
jobs for you, all of them already wired up:

1. Turns your pages into plain HTML files at build time, so Google can read them.
2. Serves Mongolian at `/` and English at `/en` from one set of components.
3. Puts the right `<title>`, description and social tags on every page.

The files that talk to the framework are `src/app/` and `src/routes/`. **You never open them.**
Everything you actually edit is ordinary React and TypeScript.

### Files you edit

Start here. This is where nearly all real work happens:

| You want to | Edit |
|---|---|
| Change the words on the page | `src/blocks/<block>/copy.ts` |
| Add, remove or reorder sections on a page | `src/config/pages.config.ts` |
| Change the site name, menu or contact details | `src/config/site.config.ts` |
| Change colours, fonts, spacing or radius | `src/styles/presets/*.css` |
| Change how a section *looks* | that block's `.tsx` file, e.g. `src/blocks/hero/hero-centered.tsx` |
| Add a whole new kind of section | a new folder in `src/blocks/` — use the command in [Adding a block](#adding-a-block) |

### Inside a block folder

Every block is one folder, and every folder holds the same four kinds of file. Using
`src/blocks/hero/` as the example:

| File | What it does | Edit it when |
|---|---|---|
| `copy.ts` | Holds all the text, in both languages. | Changing any wording — this is the one you open most |
| `block.ts` | Describes the block: its id, which layouts it offers, and which layout is the default. | Adding a layout, or changing the default |
| `variants.ts` | Connects each layout name to its component. | Adding a layout (one line) |
| `hero-centered.tsx` | The actual markup for one layout. There is one of these per layout. | Changing how the section looks |

So the everyday file is `copy.ts`, and the everyday change is text. The other three you touch only
when adding or restyling a layout.

`block.ts` and `variants.ts` are split for one measured reason, explained in
[Why `block.ts` and `variants.ts` are separate](#why-blockts-and-variantsts-are-separate). The
short version: **never import a component into `block.ts`.**

### Files you don't touch

Nothing here needs editing to build a normal site. If you think you need to change one of these,
it is worth asking whether there is a config-shaped way to do it instead:

| Path | Why leave it alone |
|---|---|
| `src/app/` | The framework's entry points. Editing these breaks the build in confusing ways |
| `src/routes/` | Four files, and four is enough forever. A new page is a config entry, **not** a new route file — see [Adding a page](#adding-a-page) |
| `src/lib/` | SEO, sitemap, page resolution. Driven entirely by your two config files |
| `src/styles/theme.css` | The design *system*. To restyle, edit a preset instead — see [Changing the design](#changing-the-design) |
| `src/integrations/` | Motion, theme and form-submit wiring, picked when the project was created |
| `scripts/` | The checks behind `pnpm verify` |

`src/components/` sits in between: layout primitives (`Section`, `Container`), the header and the
footer. You will edit the header or footer eventually. Leave `layout/` alone — every block depends
on it, and the [rules](#rules-the-build-enforces) assume it is intact.

## Adding a page

```bash
pnpm dlx @dewsoft/landing-kit add-page about
```

That is the whole command. It gives you a working `/about` page in both languages with placeholder
text, and `pnpm verify` passes straight away. Then you edit two things by hand:

1. The **titles and descriptions** for both languages — they arrive as `About (mn)` / `About (en)`,
   so you can see what to replace.
2. The **`blocks` array** — which sections the page shows.

Both live in the entry the command just wrote, in `src/config/pages.config.ts`.

> **Important: no new folder, and no new route file.** If you have used Next.js or similar, this is
> the one thing that works differently here. A page is **one entry in
> `src/config/pages.config.ts`** — nothing else. `src/routes/$.tsx` already catches every path and
> looks it up in that list, which is why `src/routes/` stays at four files no matter how many pages
> you add.

You can pass the values up front instead, if you already know them:

```bash
pnpm dlx @dewsoft/landing-kit add-page about --blocks=features,cta \
  --title-mn="Бидний тухай" --title-en="About us"
```

Optional flags: `--path=/company` (defaults to `/<id>`), `--desc-mn=…`, `--desc-en=…`.

> **Why `pnpm dlx` and not just `landing-kit`?** Your project does not depend on this kit — it is a
> standalone app, which is the point. So there is no `landing-kit` command on your PATH, and typing
> one gives `command not found`. `pnpm dlx` downloads the kit, runs it once, and forgets it.

This is what the entry looks like, if you would rather write it yourself:

```ts
{
  id: 'about',
  path: '/about',
  blocks: ['features', 'cta'],
  seo: {
    mn: { title: 'Бидний тухай', description: 'Компанийн танилцуулга.' },
    en: { title: 'About us', description: 'About our company.' },
  },
},
```

That one entry produces both locales' URLs, the sitemap entries and the prerendered files.

**The two languages must not share a title or a description.** The build rejects that as duplicate
content, so give each language its own wording. (This is why the placeholders differ.)

To put the page in the menu, add `{ target: 'about' }` to `nav` in `site.config.ts`. The label is
that page's `seo.title` for the language being rendered.

> `nav` targets and link `target`s take a page id or a block id. A block id becomes an anchor on
> whichever page holds it. A target matching neither fails the build, so you never ship a dead link.

## Adding a block

A block is a new kind of section — testimonials, pricing, an FAQ. If you know you want one while
you are still creating the site, type its name at the blocks question and it is made for you, on
the home page, in one step — see [Create your site](#create-your-site).

Afterwards, one command does the same thing:

```bash
pnpm dlx @dewsoft/landing-kit add-block testimonials
```

Unlike a page, this **does** create a folder: `src/blocks/testimonials/`. It writes four files
there, makes all three registrations, and `pnpm verify` passes right away. Then you edit two things:

1. The **copy**, in `src/blocks/testimonials/copy.ts` — both languages are in that one file.
2. The **look**, in `src/blocks/testimonials/testimonials-simple.tsx`.

> **You will not see it on the site yet.** A new block is registered but on no page. Add
> `'testimonials'` to a page's `blocks` array in `src/config/pages.config.ts` to make it appear.
> Until then it shows only on [`/docs`](#docs-the-live-reference).

Want two layouts instead of one? Name them up front:

```bash
pnpm dlx @dewsoft/landing-kit add-block pricing --variants=simple,detailed
```

The default is a single variant named `simple`. Same `pnpm dlx` reason as
[Adding a page](#adding-a-page) — there is no bare `landing-kit` command.

By hand, you write the four files described in
[Inside a block folder](#inside-a-block-folder), then register the block in three places:
`registry.ts`, `block-modules.ts` and `variants.all.ts`.

Get a registration wrong and TypeScript names the missing one — all three are typed
`Record<BlockId, …>`, and `BlockId` comes from the registry. This is the main reason to use the
command instead.

### Why `block.ts` and `variants.ts` are separate

This is the one part of the folder that is not obvious, and it is **not** a TanStack Start
convention — TanStack Start knows nothing about blocks. It is this kit's own design, for one
measured reason.

- **`block.ts`** holds the *facts*: id, variant names, the copy, the nav label. It is loaded
  **immediately** for every block, because the `<title>`, the JSON-LD and the menu need each
  block's text before anything renders.
- **`variants.ts`** holds the *components*. They load **only for the blocks on the page you are
  looking at**.

That is the whole point. Merging them into one file was measured:

| | main bundle |
|---|---|
| two files (as shipped) | **316 KB** |
| merged into one | **440 KB** |

The `motion` library stops getting its own chunk and joins the main bundle, so every visitor
downloads it whether the page animates or not. Nothing warns you: the build passes and every check
stays green.

**So the one rule is: never import a component into `block.ts`.** Everything else in the folder
you can rearrange freely.

## Adding a variant

A variant is a different layout for the same block and copy. Three steps, all inside the block's
folder:

1. Add the component, e.g. `src/blocks/hero/hero-poster.tsx`.
2. Add its name to `variantNames` in `block.ts` — `['centered', 'split', 'poster'] as const`.
3. Map the name to the component in `variants.ts` — `poster: HeroPoster`.

Then use it: `{ id: 'hero', variant: 'poster' }` in `pages.config.ts`.

You cannot forget step 3 — a name with no component is a compile error, and so is a component the
names never declare.

## Changing the design

All colour, type and spacing lives in CSS variables, in two layers:

- **`src/styles/theme.css`** — the system: type scale, spacing rhythm, and the mapping from
  variables to Tailwind utilities. Don't edit this to reskin.
- **`src/styles/presets/*.css`** — the skin: fonts, radius, shadows, and the light/dark palette.
  This is what you replace.

Swapping the whole look is one line:

```css
/* src/styles/theme.css */
@import './presets/warm.css'; /* was './presets/editorial.css' */
```

Two presets ship. `editorial.css` is quiet and neutral with a small radius and no card shadow.
`warm.css` is amber and denser, with rounder corners and a real shadow. They differ in colour,
radius, shadow and density on purpose, so a swap reads as a different design.

To add a third, copy a preset file and declare **the same variables**. That is checked, not
advisory: `pnpm conventions` fails if a preset misses a variable the theme maps. Without the check
the failure is invisible — a missing `--c-ring` just means no focus outline, and the build stays
green.

The fastest way to see a preset is [`/docs`](#docs-the-live-reference), which renders every token
live.

## The contact form

`src/blocks/contact/contact-form.tsx`, built on `react-hook-form` and `zod`. The schema lives in
`src/integrations/submit-schema.ts`.

It has two spam defences you should know about before you test it:

- A **honeypot** field that must stay empty.
- A **2 second minimum** on screen. Submit faster and it waits, it does not reject you.

## Fonts and Mongolian Cyrillic

Both fonts **must** cover Cyrillic Extended. Mongolian uses `ө` and `ү`, which sit outside the
basic Cyrillic block.

If you swap a preset's fonts, check the replacement ships both a `cyrillic` **and** a
`cyrillic-ext` subset. A font with only `cyrillic` renders those two letters in a mismatched
fallback font — easy to miss if you only proofread the English.

This also means Mongolian pages load a little more font data than English ones. That is real and
unavoidable, not a bug.

## `/docs`: the live reference

`/docs` is a generated, English-only page showing every design token, every block and variant, and
the resolved config. It reads the real code, so it cannot go out of date.

Visitors never see it: it is not prerendered, not in the sitemap, and carries `noindex`.

## Removing the /docs page

It costs visitors nothing, but delete it whenever you like:

```bash
rm src/routes/docs.tsx
rm -rf src/components/docs
```

Nothing else. `pnpm verify` passes with the route gone.

## Rules the build enforces

These are checked automatically, so you will hear about them early. Each exists because breaking
it fails silently.

- **Spacing and width come from `<Section>` and `<Container>`.** Don't write raw padding, width,
  `min-h-screen`, a bare `<section>`, or an inline `style` in a block.
- **Never write a literal `<h1>` or `<h2>` in a block.** A block cannot know if it opens the page.
  Use `const H = headingLevel === 1 ? 'h1' : 'h2'` and render `<H>`.
- **Never import `Link` from `@tanstack/react-router`.** Every link is a plain `<a href>`. Blocks
  are loaded once for the first URL, so a client-side jump would land on a page whose blocks were
  never fetched. Full page loads are cheap here — every page is static HTML.
- **Both locales, always.** There is no fallback language. `copy.ts` declares one type and types
  both `mn` and `en` against it, so a missing translation is a compile error.
- **No components in `block.ts`.** See [Adding a block](#adding-a-block).

## Gotchas

- **The contact form's 2 second guard also applies to you** while testing by hand. Working as
  intended.
- **`<input type="email">` blocks submission before any handler runs**, so a malformed email never
  reaches the schema. Don't hunt for a schema bug that isn't there.
- **If the contact form "silently fails", check CORS first.** In endpoint mode the browser POSTs
  cross-origin, so an endpoint without `Access-Control-Allow-Origin` fails at preflight — and it
  surfaces as the same generic error a real code bug would.
- **React warns `Invalid DOM property 'hreflang'` in dev.** Expected. The lowercase spelling is
  what SEO tools read from the built HTML. Renaming it to `hrefLang` would ship the wrong casing.
- **A light-only or dark-only build ships no theme-switching code at all** — none of the
  JavaScript, not just a hidden toggle.
- **A page flashing to "Not Found" right after it loads** usually means the host serves
  prerendered files by their literal `index.html` filename. `normalizePath` in
  `src/lib/pages/resolve-request.ts` handles this; check there first.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build, including prerendering |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | `biome ci .` |
| `pnpm fix` | Auto-fixes what `lint` reports |
| `pnpm conventions` | The rules above, plus preset and docs checks |
| `pnpm verify` | Everything, in order. **Run this before you deploy.** |

`pnpm verify` ends with `verify-build.mjs`, which reads the pages the build actually produced and
checks each one: exactly one `<h1>`, no hidden content in the HTML, a complete `hreflang` set,
valid JSON-LD, and a sitemap that agrees with the `<head>`.

## Scaffolding options

Every question the CLI asks has a flag, so a scaffold can be fully scripted:

```bash
pnpm dlx @dewsoft/landing-kit@latest frontend --yes
pnpm dlx @dewsoft/landing-kit@latest frontend --yes --add-blocks=pricing,faq
```

Run `pnpm dlx @dewsoft/landing-kit --help` for the full list. `--add-blocks` is the flag form of
the picker's **add your own** row, and takes as many names as you want.

Blocks are not freely combinable: some blocks' copy links to others, and a link to a block you
left out would render a blank page. The CLI refuses those combinations at the question rather than
letting the build fail later.

The generated project has no dependency on this kit. It is a plain TanStack Start app.

## Working on the kit itself

Contributing to the kit, rather than building a site with it? The env flags, the second config, the
Lighthouse budgets and the publish steps are in [MAINTAINERS.md](./MAINTAINERS.md). None of it
applies to a site you generate.
