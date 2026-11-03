/** The made-up websites behind the sample tabs: their icons and pages. */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const fromRoot = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url))

export interface Site {
  readonly name: string
  /** A Phosphor icon in the fill weight. */
  readonly glyph: string
  /** Top and bottom of the icon tile's gradient. */
  readonly colors: readonly [string, string]
}

/** By host. Every sample URL uses one of these hosts. */
export const SITES: Readonly<Record<string, Site>> = {
  "mail.example.com": { name: "Mail", glyph: "envelope-simple", colors: ["#5AB2FF", "#1E6FE8"] },
  "calendar.example.com": {
    name: "Calendar",
    glyph: "calendar-blank",
    colors: ["#FF7A6B", "#E2392D"],
  },
  "chat.example.com": { name: "Chat", glyph: "chat-circle-dots", colors: ["#9B8CFF", "#6045E6"] },
  "music.example.com": { name: "Music", glyph: "music-notes", colors: ["#FF7AA8", "#E23A72"] },
  "photos.example.com": { name: "Photos", glyph: "image-square", colors: ["#FFC94D", "#F08A16"] },
  "docs.example.com": { name: "Docs", glyph: "file-text", colors: ["#6CA8FF", "#2F6BEA"] },
  "tracker.example.com": { name: "Tracker", glyph: "kanban", colors: ["#4FD69C", "#16A06A"] },
  "design.example.com": { name: "Design", glyph: "pen-nib", colors: ["#C38CFF", "#8A3FE0"] },
  "preview.example.com": { name: "Preview", glyph: "browser", colors: ["#6E7B91", "#3D4757"] },
  "analytics.example.com": {
    name: "Analytics",
    glyph: "chart-line-up",
    colors: ["#46D3D3", "#0E9AA7"],
  },
  "wiki.example.com": { name: "Wiki", glyph: "book-open-text", colors: ["#8E9AAF", "#56627A"] },
  "news.example.com": { name: "News", glyph: "newspaper", colors: ["#FF9F5A", "#E2600F"] },
  "travel.example.com": { name: "Travel", glyph: "airplane-tilt", colors: ["#5FD0FF", "#1792D8"] },
  "maps.example.com": { name: "Maps", glyph: "map-trifold", colors: ["#7CDB7A", "#2FA444"] },
  "recipes.example.com": { name: "Recipes", glyph: "cooking-pot", colors: ["#FFB25A", "#E8741A"] },
  "shop.example.com": { name: "Shop", glyph: "sneaker-move", colors: ["#FF8A8A", "#D9434F"] },
  "learn.example.com": {
    name: "Learn",
    glyph: "graduation-cap",
    colors: ["#7FA7FF", "#4A5BE0"],
  },
  "notes.example.com": { name: "Notes", glyph: "notebook", colors: ["#FFD966", "#E5A800"] },
}

const glyphPaths = (glyph: string): string => {
  const svg = readFileSync(
    fromRoot(`node_modules/@phosphor-icons/core/assets/fill/${glyph}-fill.svg`),
    "utf8",
  )
  return svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")
}

/** A rounded tile in the site's colors with its glyph in white, on a 32-unit grid. */
export const siteIconSvg = (site: Site): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${site.colors[0]}"/><stop offset="1" stop-color="${site.colors[1]}"/></linearGradient></defs>
  <rect width="32" height="32" rx="8" fill="url(#g)"/>
  <g transform="translate(7 7) scale(${18 / 256})" fill="#fff">${glyphPaths(site.glyph)}</g>
</svg>`

export type Block =
  | { readonly heading: string }
  | { readonly text: string }
  | { readonly list: ReadonlyArray<string> }
  | { readonly checklist: ReadonlyArray<readonly [label: string, isDone: boolean]> }
  | { readonly table: ReadonlyArray<ReadonlyArray<string>> }

/** A page laid out like a document in a docs or wiki app. */
export interface DocPage {
  readonly kind: "doc"
  readonly title: string
  /** Where the document is filed, shown before its title above the page. */
  readonly folder: string
  readonly meta: string
  readonly blocks: ReadonlyArray<Block>
}

/** A product's landing page, as a preview build would show it. */
export interface LandingPage {
  readonly kind: "landing"
  readonly title: string
  readonly brand: string
  readonly nav: ReadonlyArray<string>
  readonly headline: string
  readonly lead: string
  readonly actions: readonly [primary: string, secondary: string]
  readonly features: ReadonlyArray<{ readonly title: string; readonly text: string }>
}

/** A magazine-style article under a picture. */
export interface ArticlePage {
  readonly kind: "article"
  readonly title: string
  readonly section: string
  readonly byline: string
  readonly lead: string
  readonly paragraphs: ReadonlyArray<string>
}

/** A page whose content never shows in a screenshot; only its name and icon do, in the sidebar. */
export interface PlainPage {
  readonly kind: "plain"
  readonly title: string
}

export type SamplePage = DocPage | LandingPage | ArticlePage | PlainPage

const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

const blockHtml = (block: Block): string => {
  if ("heading" in block) return `<h2>${escape(block.heading)}</h2>`
  if ("text" in block) return `<p>${escape(block.text)}</p>`
  if ("list" in block)
    return `<ul>${block.list.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>`
  if ("checklist" in block) {
    return `<ul class="checklist">${block.checklist
      .map(
        ([label, isDone]) =>
          `<li class="${isDone ? "done" : ""}"><span class="box"></span>${escape(label)}</li>`,
      )
      .join("")}</ul>`
  }
  const [head = [], ...rows] = block.table
  return `<table><thead><tr>${head.map((cell) => `<th>${escape(cell)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`
}

const siteBar = (site: Site, trail: ReadonlyArray<string>, end = "") => `
<header class="bar">
  <span class="brand">${siteIconSvg(site)}<span>${escape(site.name)}</span></span>
  ${trail.map((part) => `<span class="slash">/</span><span class="trail">${escape(part)}</span>`).join("")}
  <span class="end">${escape(end)}</span>
</header>`

const docBody = (page: DocPage, site: Site) => `
<div class="doc">
  ${siteBar(site, [page.folder, page.title])}
  <main>
    <h1>${escape(page.title)}</h1>
    <p class="meta">${escape(page.meta)}</p>
    ${page.blocks.map(blockHtml).join("\n")}
  </main>
</div>`

const landingBody = (page: LandingPage) => `
<div class="landing">
  <header><strong>${escape(page.brand)}</strong><nav>${page.nav.map((item) => `<a>${escape(item)}</a>`).join("")}</nav></header>
  <section class="hero">
    <h1>${escape(page.headline)}</h1>
    <p>${escape(page.lead)}</p>
    <div class="actions"><a class="primary">${escape(page.actions[0])}</a><a>${escape(page.actions[1])}</a></div>
  </section>
  <section class="features">${page.features
    .map(
      (feature, index) =>
        `<div class="feature"><span class="dot dot-${index}"></span><h3>${escape(feature.title)}</h3><p>${escape(feature.text)}</p></div>`,
    )
    .join("")}</section>
</div>`

// Mountains and a sun drawn in flat layers, so the article has a picture without an image file
const landscape = `<svg viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7B57C"/><stop offset="1" stop-color="#F9DDBD"/></linearGradient></defs>
  <rect width="800" height="300" fill="url(#sky)"/>
  <circle cx="560" cy="130" r="46" fill="#FFF1DC"/>
  <path d="M0 210 L120 130 L210 190 L330 100 L470 200 L560 150 L680 210 L800 160 V300 H0Z" fill="#C9705A"/>
  <path d="M0 240 L150 180 L260 230 L400 170 L520 235 L650 190 L800 230 V300 H0Z" fill="#9C4B45"/>
  <path d="M0 270 L180 235 L340 265 L500 230 L660 262 L800 245 V300 H0Z" fill="#6E3238"/>
</svg>`

const articleBody = (page: ArticlePage, site: Site) => `
<div class="article">
  ${siteBar(site, [], page.section)}
  <figure>${landscape}</figure>
  <main>
    <h1>${escape(page.title)}</h1>
    <p class="meta">${escape(page.byline)}</p>
    <p class="lead">${escape(page.lead)}</p>
    ${page.paragraphs.map((text) => `<p>${escape(text)}</p>`).join("")}
  </main>
</div>`

const plainBody = (page: PlainPage, site: Site) =>
  `<div class="doc">${siteBar(site, [])}<main><h1>${escape(page.title)}</h1></main></div>`

const FONT_PATH = "/_fonts/"

const styles = `
@font-face { font-family: Inter; font-weight: 400; src: url(${FONT_PATH}inter-latin-400-normal.woff2) format("woff2"); }
@font-face { font-family: Inter; font-weight: 500; src: url(${FONT_PATH}inter-latin-500-normal.woff2) format("woff2"); }
@font-face { font-family: Inter; font-weight: 600; src: url(${FONT_PATH}inter-latin-600-normal.woff2) format("woff2"); }
@font-face { font-family: Inter; font-weight: 700; src: url(${FONT_PATH}inter-latin-700-normal.woff2) format("woff2"); }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { font: 15px/1.6 Inter, "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif; color: #1f2328; background: #fff; -webkit-font-smoothing: antialiased; word-break: auto-phrase; }
h1, h2, h3 { letter-spacing: -0.01em; text-wrap: balance; }
p { text-wrap: pretty; }
.brand { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; }
.brand svg { width: 20px; height: 20px; }

.bar { display: flex; align-items: center; gap: 8px; height: 52px; padding: 0 24px; border-bottom: 1px solid #eceef1; font-size: 14px; white-space: nowrap; }
.bar .slash { color: #c4c9d0; }
.bar .trail { color: #57606a; overflow: hidden; text-overflow: ellipsis; }
.bar .end { margin-left: auto; color: #6e7781; font-size: 13px; }
.doc main { max-width: 680px; margin: 0 auto; padding: 36px 56px; }
.doc h1 { margin: 0; font-size: 30px; line-height: 1.25; }
.meta { margin: 8px 0 22px; color: #6e7781; font-size: 13px; }
.doc h2 { margin: 26px 0 8px; font-size: 18px; }
.doc p { margin: 0 0 12px; color: #2f363d; }
.doc ul { margin: 0 0 12px; padding-left: 20px; color: #2f363d; }
.doc li { margin: 4px 0; }
.checklist { list-style: none; padding: 0 !important; }
.checklist li { display: flex; align-items: center; gap: 10px; }
.checklist .box { flex: none; width: 16px; height: 16px; border: 1.5px solid #b5bdc7; border-radius: 4px; }
.checklist .done { color: #8b949e; text-decoration: line-through; }
.checklist .done .box { border-color: #2f6bea; background: #2f6bea url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8.5l2.5 2.5L12 5.5' stroke='white' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/12px no-repeat; }
table { width: 100%; border-collapse: collapse; margin: 4px 0 16px; font-size: 14px; }
th { text-align: left; color: #6e7781; font-weight: 500; border-bottom: 1px solid #e3e6ea; padding: 6px 8px; }
td { border-bottom: 1px solid #f0f2f4; padding: 7px 8px; }

.landing { min-height: 100%; background: radial-gradient(120% 70% at 50% 0%, #eef3ff 0%, #ffffff 60%); }
.landing header { display: flex; align-items: center; justify-content: space-between; padding: 18px 32px; font-size: 15px; }
.landing header nav { display: flex; gap: 22px; color: #57606a; font-size: 14px; }
.hero { padding: 54px 40px 30px; text-align: center; }
.hero h1 { margin: 0 auto; max-width: 560px; font-size: 36px; line-height: 1.15; font-weight: 700; }
.hero p { margin: 16px auto 0; max-width: 440px; color: #57606a; font-size: 16px; }
.actions { display: flex; justify-content: center; gap: 12px; margin-top: 26px; }
.actions a { padding: 9px 18px; border-radius: 999px; border: 1px solid #d0d7de; font-size: 14px; font-weight: 500; background: #fff; }
.actions a.primary { border-color: #1f2328; background: #1f2328; color: #fff; }
.features { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; padding: 26px 32px; }
.feature { padding: 16px; border: 1px solid #eceef1; border-radius: 12px; background: #fff; }
.feature h3 { margin: 10px 0 4px; font-size: 14px; }
.feature p { margin: 0; color: #6e7781; font-size: 13px; line-height: 1.5; }
.dot { display: block; width: 26px; height: 26px; border-radius: 8px; }
.dot-0 { background: linear-gradient(#9BB8FF, #4F7BFF); }
.dot-1 { background: linear-gradient(#FFC48A, #FF8A3D); }
.dot-2 { background: linear-gradient(#8EE3C0, #2FB889); }

.article figure { margin: 0; height: 210px; overflow: hidden; }
.article figure svg { display: block; width: 100%; height: 100%; }
.article main { max-width: 620px; margin: 0 auto; padding: 28px 32px; }
.article h1 { margin: 0; font-size: 30px; line-height: 1.2; }
.article .lead { font-size: 17px; color: #2f363d; }
.article p { margin: 0 0 12px; color: #3d444d; }

@media (max-width: 520px) {
  .bar { padding: 0 18px; }
  .doc main { padding: 28px 26px; }
  .doc h1 { font-size: 25px; }
  .hero { padding: 40px 24px 24px; }
  .hero h1 { font-size: 30px; }
  .features { padding: 20px 24px; }
}
`

const bodyOf = (page: SamplePage, site: Site) => {
  switch (page.kind) {
    case "doc":
      return docBody(page, site)
    case "landing":
      return landingBody(page)
    case "article":
      return articleBody(page, site)
    case "plain":
      return plainBody(page, site)
  }
}

/** The page at a sample URL. */
export const samplePageHtml = (page: SamplePage, site: Site, lang: string): string => {
  const body = bodyOf(page, site)
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escape(page.title)}</title><link rel="icon" href="/favicon.svg"><style>${styles}</style></head><body>${body}</body></html>`
}

/** The font file a sample page asks for at `pathname`, or null for any other path. */
export const sampleFontFile = (pathname: string): string | null =>
  pathname.startsWith(FONT_PATH)
    ? fromRoot(`node_modules/@fontsource/inter/files/${pathname.slice(FONT_PATH.length)}`)
    : null
