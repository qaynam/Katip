import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"
import { iconSvg } from "./brand/icon.ts"

const fromRoot = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

const BRAND_DIR = fromRoot("assets/brand")
const EXTENSION_ICON_DIR = fromRoot("src/apps/public/icons")

const gridIcon = iconSvg({ layout: "grid" })
const bleedIcon = iconSvg({ layout: "bleed" })

mkdirSync(BRAND_DIR, { recursive: true })
mkdirSync(EXTENSION_ICON_DIR, { recursive: true })
writeFileSync(`${BRAND_DIR}/icon.svg`, gridIcon)
writeFileSync(`${BRAND_DIR}/icon-small.svg`, bleedIcon)

// Not rasterized with a library: the icon relies on SVG filters and the lockup on a web font,
// which only a browser renders faithfully. The PNGs are committed, so this runs only when the
// artwork changes
const executablePath = process.env.KATIP_E2E_CHROME
const browser = await chromium.launch({
  ...(executablePath === undefined ? {} : { executablePath }),
  headless: true,
})
const page = await browser.newPage({ deviceScaleFactor: 1 })

const renderSvg = async (svg: string, size: number, path: string) => {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  )
  await page.screenshot({ path, omitBackground: true })
}

for (const size of [16, 32]) {
  await renderSvg(bleedIcon, size, `${EXTENSION_ICON_DIR}/icon-${size}.png`)
}
for (const size of [48, 128]) {
  await renderSvg(gridIcon, size, `${EXTENSION_ICON_DIR}/icon-${size}.png`)
}
await renderSvg(gridIcon, 512, `${BRAND_DIR}/icon-512.png`)

const renderLockup = async (textColor: string, path: string) => {
  const lockupPage = await browser.newPage({ deviceScaleFactor: 2 })
  await lockupPage.setViewportSize({ width: 320, height: 300 })
  await lockupPage.setContent(`
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@600&display=block">
    <style>
      html, body { margin: 0; background: transparent; }
      .lockup { display: grid; justify-items: center; gap: 14px; padding: 24px; width: fit-content; margin: 0 auto; }
      svg { width: 168px; height: 168px; display: block; }
      span { font-family: "Inter", sans-serif; font-weight: 600; font-size: 52px; letter-spacing: -0.035em; line-height: 1; color: ${textColor}; }
    </style>
    <div class="lockup">${gridIcon}<span>Katip</span></div>`)
  await lockupPage.evaluate(() => document.fonts.ready)
  const fontLoaded = await lockupPage.evaluate(() => document.fonts.check('600 52px "Inter"'))
  if (!fontLoaded) throw new Error("Inter did not load; the lockup would fall back to another face")
  await lockupPage.locator(".lockup").screenshot({ path, omitBackground: true })
  await lockupPage.close()
}

await renderLockup("#1d1d1f", `${BRAND_DIR}/lockup-light.png`)
await renderLockup("#f0f6fc", `${BRAND_DIR}/lockup-dark.png`)

await browser.close()
