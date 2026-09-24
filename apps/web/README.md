# Landing Kit

A bilingual (Mongolian + English) landing site, prerendered to static HTML.

You build the site by editing config and copy files. You don't rewrite components.

## Contents

- [Create your site](#create-your-site)
- [Running it](#running-it)
- [What you edit](#what-you-edit)
- [Adding a page](#adding-a-page)
- [Adding a block](#adding-a-block)
- [Adding a variant](#adding-a-variant)
- [Changing the design](#changing-the-design)
- [The contact form](#the-contact-form)
- [The admin panel](#the-admin-panel)
- [Fonts and Mongolian Cyrillic](#fonts-and-mongolian-cyrillic)
- [The /docs page](#the-docs-page)
- [Rules the build enforces](#rules-the-build-enforces)
- [Gotchas](#gotchas)
- [Scaffolding options](#scaffolding-options)
- [Working on the kit itself](#working-on-the-kit-itself)

## Create your site

```bash
pnpm dlx @tanasoftllc/landing-kit@latest my-site     # pnpm
npx --yes @tanasoftllc/landing-kit@latest my-site    # npm
yarn dlx @tanasoftllc/landing-kit@latest my-site     # yarn 2+ (on yarn 1, use the npx line)
```

It asks five questions. Arrow keys move, Enter chooses, Space toggles a block. Every question has
a default, so `--yes` skips them all.

The blocks question has an **add your own** row. Type a name like `pricing` and you get a new
section with placeholder text on the home page.

Then:

```bash
cd my-site
pnpm install
pnpm dev
```

Mongolian is at `/`, English at `/en`.

## Running it

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build, including prerendering |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` / `pnpm fix` | Biome check / auto-fix |
| `pnpm conventions` | The rules below, plus preset and docs checks |
| `pnpm verify` | Everything. Run it before you deploy. |

npm and yarn work too: use `npm run dev` or `yarn dev`.

> **Before your first deploy:** set `url` in `src/config/site.config.ts` to your real domain.
> `pnpm verify` fails until you do, because a wrong domain breaks every link Google reads.

## What you edit

A **block** is one section of a page (hero, features, cta, contact). A **page** is a list of
blocks.

| You want to | Edit |
|---|---|
| Change the words | `src/blocks/<block>/copy.ts` (both languages in one file) |
| Add, remove or reorder sections | `src/config/pages.config.ts` |
| Change the site name, menu or contact details | `src/config/site.config.ts` |
| Change colours, fonts, spacing | `src/styles/presets/*.css` |
| Change how a section looks | that block's `.tsx` file, e.g. `src/blocks/hero/hero-centered.tsx` |

Each block folder holds `copy.ts` (text), `block.ts` (id and layout names), `variants.ts` (layout
name to component) and one `.tsx` per layout.

Leave `src/app/`, `src/routes/`, `src/lib/`, `src/styles/theme.css` and `src/components/layout/`
alone. They are the framework wiring and the design system. You don't need to learn TanStack
Start to build a site.

## Adding a page

```bash
pnpm dlx @tanasoftllc/landing-kit add-page about
```

This adds one entry to `src/config/pages.config.ts` and gives you `/about` in both languages. Then
edit that entry's titles, descriptions and `blocks` list:

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

- A page is only this config entry. Don't create a route file.
- The two languages must not share a title or description. The build rejects duplicates.
- To add it to the menu, put `{ target: 'about' }` in `nav` in `site.config.ts`.
- Flags: `--blocks=features,cta`, `--path=/company`, `--title-mn=…`, `--title-en=…`,
  `--desc-mn=…`, `--desc-en=…`.

Why `pnpm dlx`? The project doesn't depend on the kit, so there is no `landing-kit` command
installed. `pnpm dlx` downloads it and runs it once.

## Adding a block

```bash
pnpm dlx @tanasoftllc/landing-kit add-block testimonials
pnpm dlx @tanasoftllc/landing-kit add-block pricing --variants=simple,detailed
```

This creates `src/blocks/testimonials/` and registers it. Edit `copy.ts` for the text and the
`.tsx` file for the look.

The new block is on no page yet. Add `'testimonials'` to a page's `blocks` in
`src/config/pages.config.ts` to show it.

**Never import a component into `block.ts`.** Every `block.ts` loads on every page. Components
live in `variants.ts`, which loads only for blocks on the current page. A component in `block.ts`
makes every visitor download it.

## Adding a variant

A variant is another layout for the same block and copy. A new project has only the layout you
picked for each block. To add another:

1. Add the component, e.g. `src/blocks/hero/hero-poster.tsx`.
2. Add `'poster'` to `variantNames` in `block.ts`.
3. Add `poster: HeroPoster` in `variants.ts`.

Then use it in `pages.config.ts`: `{ id: 'hero', variant: 'poster' }`. If you skip a step,
TypeScript tells you.

## Changing the design

- `src/styles/theme.css` is the system: type scale, spacing, and the mapping to Tailwind. Don't
  edit it to reskin.
- `src/styles/presets/*.css` is the skin: fonts, radius, shadows, light and dark colours.

Switch the whole look with one line in `theme.css`:

```css
@import './presets/warm.css'; /* was './presets/editorial.css' */
```

To make a new preset, copy one and keep the same variables. `pnpm conventions` fails if one is
missing. The [/docs page](#the-docs-page) shows every token live.

## The contact form

The form is `src/blocks/contact/contact-form.tsx`. Its schema is in
`src/integrations/submit-schema.ts`.

It has two spam checks. A hidden honeypot field must stay empty, and the form must be on screen
for at least 2 seconds before it sends (it waits, it doesn't reject you).

Submissions go to `VITE_CONTACT_ENDPOINT`. If that's unset, every submit fails.

If your project has an `api/` folder, that service is the endpoint. See `api/README.md`. Otherwise
point the variable at your own endpoint. It gets a JSON body with `name`, `email`, `message`,
`honeypot_url`, `elapsed_ms`, `locale` and `source_page`. It should reject a filled honeypot or an
`elapsed_ms` under 2000, because bots skip the browser and post straight to the endpoint.

## The admin panel

`/admin` shows the leads the contact form collected. It uses the same build and the same API, so
there is nothing extra to run.

Create the first account from the API. It asks for the password (at least 12 characters):

```bash
cd api && make seed-admin email=owner@example.mn
```

Then open `/admin` and sign in. The code is in `src/routes/admin/` (routes) and `src/admin/`
(components, API client, and the Mongolian and English strings). `/admin` is not in the sitemap or
nav and carries `noindex`.

How sign-in lasts:

- You stay signed in while you keep using it. After 7 days unused (`JWT_REFRESH_EXPIRE_DAYS`) or
  30 days in total (`JWT_SESSION_MAX_DAYS`), you sign in again.
- Sign out ends the session everywhere. A tab that's already open can still read leads for up to
  15 minutes (`JWT_ACCESS_EXPIRE_MINUTES`). On a shared computer, also close the browser.
- The panel must be served from the same origin as the API. It won't work from a separate domain.

## Fonts and Mongolian Cyrillic

Mongolian uses `ө` and `ү`, which are in Cyrillic Extended. If you change a preset's fonts, pick
ones that ship both `cyrillic` and `cyrillic-ext` subsets. Otherwise those two letters render in a
fallback font.

## The /docs page

`/docs` shows every design token, every block and variant, and the resolved config. It reads the
real code, so it's always current. It isn't prerendered, isn't in the sitemap, and carries
`noindex`.

To remove it:

```bash
rm src/routes/docs.tsx
rm -rf src/components/docs
```

## Rules the build enforces

`pnpm verify` checks these, because breaking them fails silently:

- In a block, spacing and width come from `<Section>` and `<Container>`. No raw padding, width,
  `min-h-screen`, bare `<section>` or inline `style`.
- No literal `<h1>` or `<h2>` in a block. Use `const H = headingLevel === 1 ? 'h1' : 'h2'`.
- No `Link` from `@tanstack/react-router`. Use plain `<a href>`. Blocks load for the first URL
  only, so a client-side jump lands on a page whose blocks never loaded.
- Both languages, always. A missing translation is a compile error.
- No components in `block.ts`. See [Adding a block](#adding-a-block).

`pnpm verify` also checks each built page: one `<h1>`, a full `hreflang` set, valid JSON-LD, and a
sitemap that matches.

## Gotchas

- The 2-second form check applies to you too when you test by hand.
- `<input type="email">` blocks a malformed email before any code runs. It's not a schema bug.
- If the form fails in endpoint mode, check CORS first. It shows the same generic error.
- React warns `Invalid DOM property 'hreflang'` in dev. That's expected. SEO tools need the
  lowercase spelling.
- A page that flashes "Not Found" after loading usually means the host serves files by their
  literal `index.html` name. `normalizePath` in `src/lib/pages/resolve-request.ts` handles this.

## Scaffolding options

Every question has a flag:

```bash
pnpm dlx @tanasoftllc/landing-kit@latest frontend --yes
pnpm dlx @tanasoftllc/landing-kit@latest frontend --yes --add-blocks=pricing,faq
pnpm dlx @tanasoftllc/landing-kit@latest frontend --yes --backend=api
```

`--backend=api` adds a Go service in `api/` and a `docker-compose.yml` for Postgres.
`--backend=admin` adds the admin panel on top. `--backend=none` (the default) is a static site.
Run `pnpm dlx @tanasoftllc/landing-kit --help` for the full list.

Some blocks link to others, so the CLI refuses combinations that would leave a broken link.

## Working on the kit itself

The kit is a pnpm workspace. The template is `apps/web/`, the API is `apps/api/`, the scaffolder
is `cli/`. Run `pnpm verify` from the repo root. Everything else is in
[MAINTAINERS.md](./MAINTAINERS.md).
