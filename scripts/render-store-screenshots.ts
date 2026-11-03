import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer, type IncomingMessage } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test"
import { extensionWorkerOf, launchWithExtension } from "../e2e/browser-launch.ts"
import { EXTENSION_DIR } from "../e2e/extension-dir.ts"
import { sidepanel as enSidepanel } from "../src/modules/i18n/catalogs/en/sidepanel.ts"
import { sidepanel as jaSidepanel } from "../src/modules/i18n/catalogs/ja/sidepanel.ts"
import { spotlightBoundsOver } from "../src/modules/spotlight/window-placement.ts"
import {
  CANVAS,
  image,
  MARQUEE,
  marqueeHtml,
  PAGE_BOX,
  screenshotHtml,
  SIDEBAR_BOX,
  sidebarDivider,
  SMALL_TILE,
  smallTileHtml,
  SPLIT_BOXES,
  splitGap,
  STAGE,
  windowFrame,
  type Box,
} from "./store/canvas.ts"
import {
  ALL_URLS,
  LOCALES,
  sampleExport,
  temporaryTabsOf,
  URLS,
  type LocaleSamples,
  type PageKey,
  type Shot,
  type SpaceKey,
} from "./store/samples.ts"
import { SITES, sampleFontFile, samplePageHtml, siteIconSvg } from "./store/sites.ts"

const fromRoot = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

const OUTPUT_DIR = fromRoot("store")
const ARC_SIDEBAR_FIXTURE = fromRoot("src/modules/arc-import/fixtures/arc-sidebar.json")

/** Where Katip opens Spotlight's window over the browser window in the screenshots. */
const SPOTLIGHT = spotlightBoundsOver(STAGE)
/** The margin between Spotlight's window and the panel in it. */
const SPOTLIGHT_INSET = 10

const SIDEPANEL_LABELS = { en: enSidepanel, ja: jaSidepanel } as const

const respond = (samples: LocaleSamples, request: IncomingMessage) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`)
  const site = SITES[url.hostname]
  const fontFile = sampleFontFile(url.pathname)
  if (fontFile !== null) return { type: "font/woff2", body: readFileSync(fontFile) }
  if (site === undefined) return null
  if (url.pathname === "/favicon.svg") return { type: "image/svg+xml", body: siteIconSvg(site) }
  const key = (Object.keys(URLS) as ReadonlyArray<PageKey>).find((key) => URLS[key] === url.href)
  const page = key === undefined ? { kind: "plain" as const, title: site.name } : samples.pages[key]
  return { type: "text/html; charset=utf-8", body: samplePageHtml(page, site, samples.lang) }
}

/**
 * Serves the sample sites, in the language last passed to `show`, to browsers launched with
 * `args`.
 */
const serveSamples = async () => {
  let shown: LocaleSamples | undefined
  const server = createServer((request, response) => {
    const found = shown === undefined ? null : respond(shown, request)
    response.writeHead(found === null ? 404 : 200, { "content-type": found?.type ?? "text/plain" })
    response.end(found?.body ?? "")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return {
    // Not Playwright's request routing: tabs that the extension opens in quick succession start
    // loading before Playwright attaches to them, and would reach for the real hosts. The
    // features turned off would first try each page over TLS, which this server doesn't speak,
    // and Helium's balanced HTTPS-First mode would then stop at a warning page
    args: [
      `--host-resolver-rules=MAP *.example.com 127.0.0.1:${port}`,
      "--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable",
    ],
    show: (samples: LocaleSamples) => {
      shown = samples
    },
    close: async () => {
      // close never finishes while Chrome keeps its keep-alive connections open
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

// Not the development build: it writes to dist/ and would reload the extension loaded by
// `pnpm dev`. The production bundle, as users get it, goes where the E2E tests load it from
const buildExtension = () =>
  execFileSync("pnpm", ["exec", "vite", "build", "--outDir", EXTENSION_DIR, "--emptyOutDir"], {
    stdio: "inherit",
  })

interface Session {
  readonly context: BrowserContext
  readonly background: Worker
  readonly origin: string
  readonly sidebar: Page
  /** The window the sidebar shows, where every sample tab opens. */
  readonly windowId: number
  readonly samples: LocaleSamples
  readonly close: () => Promise<void>
}

const setLocale = (background: Worker, locale: LocaleSamples["lang"]) =>
  background.evaluate(async (locale) => {
    const key = "katip/settings"
    const stored: unknown = (await chrome.storage.sync.get(key))[key]
    await chrome.storage.sync.set({ [key]: { ...(stored ?? {}), locale } })
  }, locale)

/**
 * Launches Chrome with Katip on a fresh profile, with the side panel open as a tab. Katip shows
 * English until the setup is done, whatever language the browser prefers, as the setup finds
 * things by their English labels.
 */
const launchSession = async (samples: LocaleSamples, args: ReadonlyArray<string>) => {
  const { context, close } = await launchWithExtension(EXTENSION_DIR, args)
  const background = await extensionWorkerOf(context)
  await setLocale(background, "en")
  const origin = `chrome-extension://${new URL(background.url()).host}`
  const sidebar = context.pages()[0] ?? (await context.newPage())
  await sidebar.setViewportSize(SIDEBAR_BOX)
  await sidebar.goto(`${origin}/sidepanel/index.html`)
  await sidebar.getByRole("heading").waitFor()
  const windowId = await sidebar.evaluate(async () => (await chrome.windows.getCurrent()).id)
  if (windowId === undefined) throw new Error("the sidebar is in no window")
  return { context, background, origin, sidebar, windowId, samples, close } satisfies Session
}

/** The side panel's labels in the language the session ends up showing. */
const labelsOf = (session: Session) => SIDEPANEL_LABELS[session.samples.lang]

// Pages that were never visited have no icon in Chrome's favicon cache, and a closed pin can only
// show a cached icon. A popup window, which Katip gives no Space, visits each page once
const cacheFavicons = async ({ context, background }: Session) => {
  const [first = "", ...rest] = ALL_URLS
  const opened = context.waitForEvent("page")
  await background.evaluate((url) => chrome.windows.create({ type: "popup", url }), first)
  const visitor = await opened
  await visitor.waitForURL(first)
  for (const url of rest) {
    // The icon is stored a moment after the page finishes loading
    await visitor.waitForTimeout(250)
    await visitor.goto(url)
  }
  await visitor.waitForTimeout(250)
  await visitor.close()
}

/** Opens one of Katip's pages as a tab in the sidebar's window. */
const openKatipPage = async ({ context, background, origin, windowId }: Session, path: string) => {
  const url = `${origin}/${path}`
  const opened = context.waitForEvent("page", (page) => page.url() === url)
  await background.evaluate(({ windowId, url }) => chrome.tabs.create({ windowId, url }), {
    windowId,
    url,
  })
  return opened
}

const importSamples = async (session: Session, workDir: string) => {
  const file = join(workDir, `katip-samples-${session.samples.lang}.json`)
  writeFileSync(file, JSON.stringify(sampleExport(session.samples), null, 2))
  // The import opens the Favorites in the window of the settings page
  const options = await openKatipPage(session, "options/index.html#data")
  await options.locator('input[type="file"]').nth(1).setInputFiles(file)
  await options.getByRole("region").getByRole("button", { name: "Import", exact: true }).click()
  await options.getByRole("status").filter({ hasText: "Imported" }).waitFor()
  await options.close()
}

const deleteShownSpace = async ({ sidebar }: Session) => {
  await sidebar.getByRole("button", { name: enSidepanel["sidepanel.space.menu"] }).click()
  await sidebar.getByRole("menuitem", { name: enSidepanel["sidepanel.space.delete"] }).click()
  await sidebar.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click()
}

const switchSpace = async (session: Session, key: SpaceKey, labels = labelsOf(session)) => {
  const { sidebar, samples } = session
  await sidebar
    .getByRole("navigation", { name: labels["sidepanel.space.switcher"] })
    .getByRole("button", { name: samples.spaceNames[key], exact: true })
    .click()
  await sidebar.getByRole("heading", { name: samples.spaceNames[key] }).waitFor()
}

/** Opens the Space's sample tabs; the Space must be the one shown. */
const openTemporaryTabs = async (session: Session, key: SpaceKey) => {
  // New tabs go on top of the list, so the last one opened is listed first
  const urls = temporaryTabsOf(key)
    .map((page) => URLS[page])
    .toReversed()
  await session.background.evaluate(
    async ({ windowId, urls }) => {
      for (const url of urls) await chrome.tabs.create({ windowId, url, active: false })
    },
    { windowId: session.windowId, urls },
  )
}

// Switching to a Space without tabs opens a new tab in it, which the sample tabs make unneeded
const closeNewTabs = ({ background, windowId }: Session) =>
  background.evaluate(async (windowId) => {
    const tabs = await chrome.tabs.query({ windowId, url: "chrome://newtab/" })
    await chrome.tabs.remove(tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])))
  }, windowId)

const showLanguage = async (session: Session) => {
  await setLocale(session.background, session.samples.lang)
  await session.sidebar
    .getByRole("navigation", { name: labelsOf(session)["sidepanel.space.switcher"] })
    .waitFor()
}

/** Fills the profile with the sample Spaces, pins, Favorites and tabs, in the samples' language. */
const seed = async (session: Session, workDir: string) => {
  await cacheFavicons(session)
  await importSamples(session, workDir)
  await deleteShownSpace(session)
  for (const key of ["personal", "work"] as const) {
    await switchSpace(session, key, enSidepanel)
    await openTemporaryTabs(session, key)
  }
  await closeNewTabs(session)
  await showLanguage(session)
}

const pinnedRegion = (session: Session) =>
  session.sidebar.getByRole("region", { name: labelsOf(session)["sidepanel.pinned.region"] })

const activeUrls = ({ background, windowId }: Session) =>
  background.evaluate(
    async (windowId) =>
      (await chrome.tabs.query({ windowId, active: true })).map((tab) => tab.pendingUrl ?? tab.url),
    windowId,
  )

const waitUntilActive = async (session: Session, url: string) => {
  for (let attempt = 0; !(await activeUrls(session)).includes(url); attempt += 1) {
    if (attempt > 50) throw new Error(`${url} never became the active tab`)
    await session.sidebar.waitForTimeout(100)
  }
}

/** Clicks a pin, which opens its page in a tab and brings it to the front. */
const openPin = async (session: Session, key: PageKey) => {
  await pinnedRegion(session)
    .getByRole("button", { name: session.samples.pages[key].title, exact: true })
    .click()
  await waitUntilActive(session, URLS[key])
}

const collapseFolder = async (session: Session, name: string) => {
  const header = pinnedRegion(session).getByRole("button", { name, exact: true })
  if ((await header.getAttribute("aria-expanded")) === "true") await header.click()
}

/** Leaves the side panel as it rests: no hover highlight, tooltip or transition in flight. */
const settle = async (page: Page) => {
  await page.mouse.move(page.viewportSize()?.width ?? 0, 0)
  await page.waitForTimeout(800)
}

interface Captures {
  readonly sidebarSpaces: string
  readonly spotlight: string
  readonly sidebarSplit: string
  readonly sidebarThemes: string
  readonly settings: string
}

const captureScenes = async (session: Session, workDir: string): Promise<Captures> => {
  const { sidebar, samples } = session
  const shot = (name: string) => join(workDir, `${samples.lang}-${name}.png`)
  const files: Captures = {
    sidebarSpaces: shot("sidebar-spaces"),
    spotlight: shot("spotlight"),
    sidebarSplit: shot("sidebar-split"),
    sidebarThemes: shot("sidebar-themes"),
    settings: shot("settings"),
  }

  await switchSpace(session, "work")
  await collapseFolder(session, samples.folderNames.team)
  await collapseFolder(session, samples.folderNames.research)
  await openPin(session, "board")
  await openPin(session, "roadmap")
  await settle(sidebar)
  await sidebar.screenshot({ path: files.sidebarSpaces })

  const [spotlight] = await Promise.all([
    session.context.waitForEvent("page", (page) => page.url().includes("/spotlight/")),
    sidebar
      .getByRole("button", { name: labelsOf(session)["sidepanel.spotlight.button"], exact: true })
      .click(),
  ])
  await spotlight.setViewportSize({ width: SPOTLIGHT.width, height: SPOTLIGHT.height })
  await spotlight.getByRole("combobox").fill(samples.spotlightQuery)
  await spotlight.getByRole("option").first().waitFor()
  await spotlight.waitForTimeout(600)
  await spotlight.locator("main").screenshot({ path: files.spotlight })
  // Spotlight closes itself once it loses focus
  if (!spotlight.isClosed()) await spotlight.close()

  await pinnedRegion(session)
    .getByRole("button", { name: samples.pages.spec.title, exact: true })
    .click()
  await waitUntilActive(session, URLS.spec)
  await settle(sidebar)
  await sidebar.screenshot({ path: files.sidebarSplit })

  await switchSpace(session, "personal")
  await openPin(session, "kyoto")
  await sidebar
    .getByRole("button", { name: labelsOf(session)["sidepanel.space.menu"], exact: true })
    .click()
  await sidebar
    .getByRole("menuitem", { name: labelsOf(session)["sidepanel.space.editTheme"] })
    .click()
  await settle(sidebar)
  await sidebar.screenshot({ path: files.sidebarThemes })

  const settings = await openKatipPage(session, "options/index.html#data")
  await settings.setViewportSize(STAGE)
  await settings.locator('input[type="file"]').first().setInputFiles(ARC_SIDEBAR_FIXTURE)
  // The innermost region holding the Spaces to choose is the preview
  const preview = settings
    .getByRole("region")
    .filter({ has: settings.getByRole("checkbox") })
    .last()
  await preview.evaluate((element) => {
    element.scrollIntoView({ block: "start" })
    window.scrollBy(0, -24)
  })
  await settle(settings)
  await settings.screenshot({ path: files.settings })
  return files
}

interface PageCaptures {
  readonly roadmap: string
  readonly spec: string
  readonly prototype: string
  readonly kyoto: string
}

/** Screenshots each sample page at the size it fills in a store screenshot. */
const capturePages = async (
  browser: Browser,
  samples: LocaleSamples,
  workDir: string,
): Promise<PageCaptures> => {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const capture = async (key: PageKey, box: Box) => {
    const file = join(workDir, `${samples.lang}-page-${key}.png`)
    await page.setViewportSize({ width: box.width, height: box.height })
    await page.goto(URLS[key])
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: file })
    return file
  }
  const pages = {
    roadmap: await capture("roadmap", PAGE_BOX),
    spec: await capture("spec", SPLIT_BOXES[0]),
    prototype: await capture("prototype", SPLIT_BOXES[1]),
    kyoto: await capture("kyoto", PAGE_BOX),
  }
  await page.close()
  return pages
}

const render = async (
  browser: Browser,
  workDir: string,
  html: string,
  size: { readonly width: number; readonly height: number },
  path: string,
) => {
  // A file of its own, so the screenshots and fonts it refers to by file URL may load
  const source = join(workDir, "canvas.html")
  writeFileSync(source, html)
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(source).href)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path })
  await page.close()
}

/** The browser window at `box`: the side panel, then one page or the two of a split view. */
const browserWindow = (box: Box, sidebar: string, pages: string | readonly [string, string]) =>
  windowFrame(
    box,
    [
      image(sidebar, SIDEBAR_BOX),
      sidebarDivider(),
      ...(typeof pages === "string"
        ? [image(pages, PAGE_BOX)]
        : [image(pages[0], SPLIT_BOXES[0]), splitGap(), image(pages[1], SPLIT_BOXES[1])]),
    ].join(""),
  )

const SPOTLIGHT_PANEL: Box = {
  left: SPOTLIGHT.left + SPOTLIGHT_INSET,
  top: SPOTLIGHT.top + SPOTLIGHT_INSET,
  width: SPOTLIGHT.width - SPOTLIGHT_INSET * 2,
  height: SPOTLIGHT.height - SPOTLIGHT_INSET * 2,
}

const screenshotsOf = (captures: Captures, pages: PageCaptures) =>
  [
    {
      file: "1-spaces",
      shot: "spaces",
      window: browserWindow(STAGE, captures.sidebarSpaces, pages.roadmap),
    },
    {
      file: "2-spotlight",
      shot: "spotlight",
      window: browserWindow(STAGE, captures.sidebarSpaces, pages.roadmap),
      overlay: image(captures.spotlight, SPOTLIGHT_PANEL, "floating"),
    },
    {
      file: "3-split-view",
      shot: "split",
      window: browserWindow(STAGE, captures.sidebarSplit, [pages.spec, pages.prototype]),
    },
    {
      file: "4-import",
      shot: "arc",
      window: windowFrame(STAGE, image(captures.settings, { ...STAGE, left: 0, top: 0 })),
    },
    {
      file: "5-themes",
      shot: "themes",
      window: browserWindow(STAGE, captures.sidebarThemes, pages.kyoto),
    },
  ] as const satisfies ReadonlyArray<{
    readonly file: string
    readonly shot: Shot
    readonly window: string
    readonly overlay?: string
  }>

const renderPromos = async (
  browser: Browser,
  workDir: string,
  samples: LocaleSamples,
  captures: Captures,
  pages: PageCaptures,
) => {
  const promoDir = join(OUTPUT_DIR, "promo")
  rmSync(promoDir, { recursive: true, force: true })
  mkdirSync(promoDir, { recursive: true })
  await render(
    browser,
    workDir,
    smallTileHtml({
      tagline: "Vertical tabs, Spaces and pins in the side panel",
      sidebar: windowFrame(
        { left: 252, top: 36, width: SIDEBAR_BOX.width, height: SIDEBAR_BOX.height },
        // From the Favorites down, where the rows tell what Katip does at this size
        image(captures.sidebarSpaces, { ...SIDEBAR_BOX, top: -40 }),
      ),
    }),
    SMALL_TILE,
    join(promoDir, "small-tile.png"),
  )
  await render(
    browser,
    workDir,
    marqueeHtml({
      headline: samples.captions.spaces.title,
      subtitle: samples.captions.spaces.subtitle,
      window: browserWindow(
        { ...STAGE, left: 640, top: 72 },
        captures.sidebarSpaces,
        pages.roadmap,
      ),
    }),
    MARQUEE,
    join(promoDir, "marquee.png"),
  )
}

buildExtension()
const workDir = mkdtempSync(join(tmpdir(), "katip-store-"))
const sites = await serveSamples()
const executablePath = process.env.KATIP_E2E_CHROME
const plain = await chromium.launch({
  ...(executablePath === undefined ? {} : { executablePath }),
  headless: true,
  args: sites.args,
})

try {
  for (const samples of LOCALES) {
    sites.show(samples)
    const session = await launchSession(samples, sites.args)
    const captures = await seed(session, workDir)
      .then(() => captureScenes(session, workDir))
      .finally(session.close)
    const pages = await capturePages(plain, samples, workDir)
    const outDir = join(OUTPUT_DIR, "screenshots", samples.lang)
    rmSync(outDir, { recursive: true, force: true })
    mkdirSync(outDir, { recursive: true })
    for (const { file, shot, ...framed } of screenshotsOf(captures, pages)) {
      await render(
        plain,
        workDir,
        screenshotHtml({ lang: samples.lang, caption: samples.captions[shot], ...framed }),
        CANVAS,
        join(outDir, `${file}.png`),
      )
    }
    if (samples.lang === "en") await renderPromos(plain, workDir, samples, captures, pages)
  }
} finally {
  await plain.close()
  await sites.close()
  rmSync(workDir, { recursive: true, force: true })
}
