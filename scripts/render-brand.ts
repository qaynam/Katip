import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"
import { iconSvg } from "./brand/icon.ts"
import { horizontalLogoSvg, stackedLogoSvg, wordmarkSvg } from "./brand/logo.ts"

const fromRoot = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

const BRAND_DIR = fromRoot("assets/brand")
const PNG_DIR = `${BRAND_DIR}/png`
const EXTENSION_ICON_DIR = fromRoot("src/apps/public/icons")

const svgs = {
  icon: iconSvg({ layout: "grid" }),
  "icon-small": iconSvg({ layout: "bleed" }),
  logo: stackedLogoSvg("light"),
  "logo-dark": stackedLogoSvg("dark"),
  "logo-horizontal": horizontalLogoSvg("light"),
  "logo-horizontal-dark": horizontalLogoSvg("dark"),
  wordmark: wordmarkSvg("light"),
  "wordmark-dark": wordmarkSvg("dark"),
}

rmSync(PNG_DIR, { recursive: true, force: true })
mkdirSync(PNG_DIR, { recursive: true })
mkdirSync(EXTENSION_ICON_DIR, { recursive: true })
for (const [name, svg] of Object.entries(svgs)) writeFileSync(`${BRAND_DIR}/${name}.svg`, svg)

// Not rasterized with a library: the icon relies on SVG filters (drop shadows), which only a
// browser renders faithfully. The PNGs are committed, so this runs only when the artwork changes
const executablePath = process.env.KATIP_E2E_CHROME
const browser = await chromium.launch({
  ...(executablePath === undefined ? {} : { executablePath }),
  headless: true,
})
const page = await browser.newPage({ deviceScaleFactor: 1 })

const render = async (svg: string, width: number, path: string) => {
  const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  await page.setViewportSize({ width: width + 16, height: 2048 })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}img{display:block}</style><img src="${source}" width="${width}">`,
  )
  await page.locator("img").evaluate((image: HTMLImageElement) => image.decode())
  await page.locator("img").screenshot({ path, omitBackground: true })
}

// The small artwork fills the canvas and drops the tab rows, which blur away below 48 px
const iconFor = (size: number) => (size <= 32 ? svgs["icon-small"] : svgs.icon)

for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
  await render(iconFor(size), size, `${PNG_DIR}/icon-${size}.png`)
}
for (const size of [16, 32, 48, 128]) {
  await render(iconFor(size), size, `${EXTENSION_ICON_DIR}/icon-${size}.png`)
}
for (const [name, widths] of [
  ["logo", [256, 512, 1024]],
  ["logo-dark", [256, 512, 1024]],
  ["logo-horizontal", [480, 960, 1920]],
  ["logo-horizontal-dark", [480, 960, 1920]],
  ["wordmark", [240, 480, 960]],
  ["wordmark-dark", [240, 480, 960]],
] as const) {
  for (const width of widths) {
    await render(svgs[name], width, `${PNG_DIR}/${name}-${width}w.png`)
  }
}

await browser.close()
