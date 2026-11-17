import { execFileSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer, type IncomingMessage } from "node:http"
import { createServer as createSecureServer } from "node:https"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  chromium,
  type Browser,
  type Locator,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test"
import { extensionWorkerOf, launchWithExtension } from "../e2e/browser-launch.ts"
import { EXTENSION_DIR } from "../e2e/extension-dir.ts"
import { sidepanel as enSidepanel } from "../src/modules/i18n/catalogs/en/sidepanel.ts"
import { sidepanel as jaSidepanel } from "../src/modules/i18n/catalogs/ja/sidepanel.ts"
import { DEFAULT_SPOTLIGHT_POSITION } from "../src/modules/spotlight/spotlight-size.ts"
import { spotlightBoundsOver } from "../src/modules/spotlight/window-placement.ts"
import {
  CANVAS,
  image,
  MARQUEE,
  marqueeHtml,
  screenshotHtml,
  sidebarDivider,
  SMALL_TILE,
  smallTileHtml,
  SOCIAL_CARD,
  socialCardHtml,
  splitGap,
  STAGE,
  STORE_WINDOW,
  veil,
  WEBSITE_WINDOW,
  websiteScreenshotHtml,
  windowFrame,
  type Box,
  type WindowLayout,
} from "./store/canvas.ts"
import {
  ALL_URLS,
  BANG_COMMANDS,
  bangSiteUrlOf,
  LOCALES,
  sampleExport,
  sampleGmailFeed,
  temporaryTabsOf,
  URLS,
  type LocaleSamples,
  type PageKey,
  type Shot,
  type SpaceKey,
  WEBSITE_LIVE_FOLDER,
} from "./store/samples.ts"
import { SITES, sampleFontFile, samplePageHtml, siteIconSvg } from "./store/sites.ts"

const fromRoot = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

const OUTPUT_DIR = fromRoot("store")

// The store takes screenshots at 1280×800 only. The website shows its own wider than that, on
// screens of twice the density, where they would look blurred
const WEBSITE_SCALE = 2
const ARC_SIDEBAR_FIXTURE = fromRoot("src/modules/arc-import/fixtures/arc-sidebar.json")

/** Where Katip opens Spotlight's window over a browser window at `window` in the screenshots. */
const spotlightOver = (window: Box) =>
  spotlightBoundsOver(window, "Normal", DEFAULT_SPOTLIGHT_POSITION)

/** The website's screenshots are of the window alone, so its corner is the page's. */
const WEBSITE_STAGE: Box = { left: 0, top: 0, ...WEBSITE_WINDOW }

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
  /** Whether the Work Space ends with the website's live folder. */
  readonly liveFolder: boolean
  readonly close: () => Promise<void>
}

/** The mailbox's page, so far as the browser needs it to keep an icon for the site */
const GMAIL_MAILBOX_PATH = "/mail/u/0/"

// A plain envelope rather than Gmail's own icon, which isn't the sample's to show
const MAIL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="3" y="7" width="26" height="18" rx="3" fill="#2f6fde"/><path d="M6 11l10 7 10-7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const gmailResponse = (path: string) => {
  if (path.startsWith(`${GMAIL_MAILBOX_PATH}feed/atom`)) {
    return { type: "application/atom+xml", body: sampleGmailFeed(Date.now()) }
  }
  if (path === GMAIL_MAILBOX_PATH) {
    return {
      type: "text/html; charset=utf-8",
      body: `<!doctype html><title>Mail</title><link rel="icon" href="/favicon.svg">`,
    }
  }
  return path === "/favicon.svg" ? { type: "image/svg+xml", body: MAIL_ICON } : null
}

/**
 * Serves {@link sampleGmailFeed} as mail.google.com does, to browsers launched with `args`.
 *
 * @remarks
 * Over HTTPS, as the live folder fetches only https URLs, with a certificate made for the run that
 * the browser is told to accept.
 */
const serveGmailFeed = async (workDir: string) => {
  const key = join(workDir, "gmail-key.pem")
  const cert = join(workDir, "gmail-cert.pem")
  execFileSync("openssl", [
    ...["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1"],
    ...["-keyout", key, "-out", cert, "-subj", "/CN=mail.google.com"],
  ])
  const server = createSecureServer(
    { key: readFileSync(key), cert: readFileSync(cert) },
    (request, response) => {
      const found = gmailResponse(request.url ?? "/")
      response.writeHead(found === null ? 404 : 200, {
        "content-type": found?.type ?? "text/plain",
      })
      response.end(found?.body ?? "")
    },
  )
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return {
    hostRule: `MAP mail.google.com 127.0.0.1:${port}`,
    args: ["--ignore-certificate-errors"],
    close: async () => {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

// Not by allowing access in the settings: Chrome grants an optional permission only through its
// prompt, which a script can't answer
/** A copy of the extension that may read mail.google.com from the moment it's installed. */
const extensionWithGmailAccess = (workDir: string) => {
  const dir = join(workDir, "extension-with-gmail")
  cpSync(EXTENSION_DIR, dir, { recursive: true })
  const manifestPath = join(dir, "manifest.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as chrome.runtime.ManifestV3
  const gmail = "https://mail.google.com/*"
  writeFileSync(
    manifestPath,
    JSON.stringify({
      ...manifest,
      host_permissions: [...(manifest.host_permissions ?? []), gmail],
      optional_host_permissions: (manifest.optional_host_permissions ?? []).filter(
        (origin) => origin !== gmail,
      ),
    }),
  )
  return dir
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
const launchSession = async (
  samples: LocaleSamples,
  args: ReadonlyArray<string>,
  layout: WindowLayout,
  { extensionDir = EXTENSION_DIR, liveFolder = false } = {},
) => {
  const { context, close } = await launchWithExtension(extensionDir, args, {
    deviceScaleFactor: WEBSITE_SCALE,
  })
  const background = await extensionWorkerOf(context)
  await setLocale(background, "en")
  const origin = `chrome-extension://${new URL(background.url()).host}`
  const sidebar = context.pages()[0] ?? (await context.newPage())
  await sidebar.setViewportSize(layout.sidebar)
  await sidebar.goto(`${origin}/sidepanel/index.html`)
  await sidebar.getByRole("heading").waitFor()
  const windowId = await sidebar.evaluate(async () => (await chrome.windows.getCurrent()).id)
  if (windowId === undefined) throw new Error("the sidebar is in no window")
  return {
    context,
    background,
    origin,
    sidebar,
    windowId,
    samples,
    liveFolder,
    close,
  } satisfies Session
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
  writeFileSync(
    file,
    JSON.stringify(sampleExport(session.samples, { liveFolder: session.liveFolder }), null, 2),
  )
  // The import opens the Favorites in the window of the settings page
  const options = await openKatipPage(session, "options/index.html#data")
  await options.locator('input[type="file"]').nth(1).setInputFiles(file)
  await options.getByRole("region").getByRole("button", { name: "Import", exact: true }).click()
  await options.getByRole("status").filter({ hasText: "Imported" }).waitFor()
  await options.close()
}

// Through the settings, as people add them: the export file carries no commands
const addBangCommands = async (session: Session) => {
  const settings = await openKatipPage(session, "options/index.html")
  await settings.getByRole("tab", { name: "Command Palette" }).click()
  for (const command of BANG_COMMANDS) {
    const name = SITES[command.host]?.name ?? command.host
    await settings.getByRole("button", { name: "Add Command" }).click()
    const form = settings.getByRole("form", { name: "New Command" })
    await form.getByLabel("Name").fill(name)
    await form.getByLabel("URL").fill(`${bangSiteUrlOf(command)}search?q=%s`)
    await form.getByLabel("Keyword").fill(command.keyword)
    await form.getByRole("button", { name: "Save" }).click()
    await settings.getByText(name, { exact: true }).first().waitFor()
  }
  await settings.close()
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

/** Visits the mailbox once, so the browser keeps the icon the live folder shows for it. */
const cacheMailIcon = async ({ context, background }: Session) => {
  const url = `https://mail.google.com${GMAIL_MAILBOX_PATH}`
  const opened = context.waitForEvent("page")
  await background.evaluate((url) => chrome.windows.create({ type: "popup", url }), url)
  const visitor = await opened
  await visitor.waitForURL(url)
  // The icon is stored a moment after the page finishes loading
  await visitor.waitForTimeout(400)
  await visitor.close()
}

/** Fills the profile with the sample Spaces, pins, Favorites and tabs, in the samples' language. */
const seed = async (session: Session, workDir: string) => {
  await cacheFavicons(session)
  if (session.liveFolder) await cacheMailIcon(session)
  await importSamples(session, workDir)
  await addBangCommands(session)
  await deleteShownSpace(session)
  for (const key of ["personal", "work"] as const) {
    await switchSpace(session, key, enSidepanel)
    await openTemporaryTabs(session, key)
  }
  await closeNewTabs(session)
  await showLanguage(session)
  if (session.liveFolder) {
    // Filled once the folder's first fetch of the sample feed comes back
    const [newest] = WEBSITE_LIVE_FOLDER.mails
    await pinnedRegion(session).getByText(newest.subject).waitFor()
  }
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
  readonly bangs: string
  readonly sidebarThemes: string
  readonly settings: string
  /** How wide the settings' list of categories is, left of the page it shows. */
  readonly settingsNavWidth: number
  /** Where the pinned split view's row is in {@link Captures.sidebarSplit}. */
  readonly pinnedSplitRow: Box
  /** The same split view unpinned, so it sits among the temporary tabs. */
  readonly sidebarTemporarySplit: string
  /** Where its row is in {@link Captures.sidebarTemporarySplit}. */
  readonly temporarySplitRow: Box
  /** The Personal Space as it rests, before its theme editor opens. */
  readonly sidebarPersonal: string
}

const boxOf = async (element: Locator): Promise<Box> => {
  const box = await element.boundingBox()
  if (box === null) throw new Error("The element to measure isn't shown")
  return {
    left: Math.round(box.x),
    top: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  }
}

/**
 * Opens Spotlight from the side panel at the size of `bounds`, types `query` and screenshots what
 * it lists.
 */
const captureSpotlight = async (session: Session, query: string, bounds: Box, path: string) => {
  const [spotlight] = await Promise.all([
    session.context.waitForEvent("page", (page) => page.url().includes("/spotlight/")),
    session.sidebar
      .getByRole("button", { name: labelsOf(session)["sidepanel.spotlight.open"], exact: true })
      .click(),
  ])
  await spotlight.setViewportSize({ width: bounds.width, height: bounds.height })
  await spotlight.getByRole("combobox").fill(query)
  await spotlight.getByRole("option").first().waitFor()
  await spotlight.waitForTimeout(600)
  await spotlight.locator("main").screenshot({ path })
  // Spotlight closes itself once it loses focus
  if (!spotlight.isClosed()) await spotlight.close()
}

/** Screenshots the side panel, Spotlight and the settings for windows of `stage`'s size. */
const captureScenes = async (session: Session, workDir: string, stage: Box): Promise<Captures> => {
  const { sidebar, samples } = session
  const spotlight = spotlightOver(stage)
  const shot = (name: string) =>
    join(workDir, `${samples.lang}-${stage.width}x${stage.height}-${name}.png`)
  const files = {
    sidebarSpaces: shot("sidebar-spaces"),
    spotlight: shot("spotlight"),
    sidebarSplit: shot("sidebar-split"),
    bangs: shot("bangs"),
    sidebarThemes: shot("sidebar-themes"),
    settings: shot("settings"),
    sidebarTemporarySplit: shot("sidebar-temporary-split"),
    sidebarPersonal: shot("sidebar-personal"),
  }

  await switchSpace(session, "work")
  await collapseFolder(session, samples.folderNames.team)
  await collapseFolder(session, samples.folderNames.research)
  await openPin(session, "board")
  await openPin(session, "roadmap")
  await settle(sidebar)
  await sidebar.screenshot({ path: files.sidebarSpaces })

  await captureSpotlight(session, samples.spotlightQuery, spotlight, files.spotlight)

  await pinnedRegion(session)
    .getByRole("button", { name: samples.pages.spec.title, exact: true })
    .click()
  await waitUntilActive(session, URLS.spec)
  await settle(sidebar)
  await sidebar.screenshot({ path: files.sidebarSplit })
  const pinnedSplitRow = await boxOf(pinnedRegion(session).locator("li.split"))
  // A ! alone lists the commands that have a keyword
  await captureSpotlight(session, "!", spotlight, files.bangs)

  // Unpinned, the split view joins the temporary tabs, as one made by dropping a tab on a tab does
  await pinnedRegion(session).locator("li.split").click({ button: "right" })
  await sidebar.getByRole("menuitem", { name: labelsOf(session)["sidepanel.tab.unpin"] }).click()
  // The live folder would push the temporary tabs out of sight
  if (session.liveFolder) {
    const liveFolder = pinnedRegion(session)
      .getByRole("button", { name: WEBSITE_LIVE_FOLDER.title })
      .first()
    if ((await liveFolder.getAttribute("aria-expanded")) === "true") await liveFolder.click()
  }
  const temporarySplit = sidebar.locator("li.split").first()
  await temporarySplit.waitFor()
  await settle(sidebar)
  await sidebar.screenshot({ path: files.sidebarTemporarySplit })
  const temporarySplitRow = await boxOf(temporarySplit)

  await switchSpace(session, "personal")
  await openPin(session, "kyoto")
  await settle(sidebar)
  await sidebar.screenshot({ path: files.sidebarPersonal })
  await sidebar
    .getByRole("button", { name: labelsOf(session)["sidepanel.space.menu"], exact: true })
    .click()
  await sidebar
    .getByRole("menuitem", { name: labelsOf(session)["sidepanel.space.editTheme"] })
    .click()
  await settle(sidebar)
  await sidebar.screenshot({ path: files.sidebarThemes })

  const settings = await openKatipPage(session, "options/index.html#data")
  await settings.setViewportSize({ width: stage.width, height: stage.height })
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
  const pane = await settings.getByRole("tabpanel").boundingBox()
  return {
    ...files,
    settingsNavWidth: Math.round(pane?.x ?? 0),
    pinnedSplitRow,
    temporarySplitRow,
  } satisfies Captures
}

interface PageCaptures {
  readonly roadmap: string
  readonly spec: string
  readonly prototype: string
  readonly kyoto: string
}

/** Screenshots each sample page at the size it fills in a window of `layout`. */
const capturePages = async (
  browser: Browser,
  samples: LocaleSamples,
  workDir: string,
  layout: WindowLayout,
): Promise<PageCaptures> => {
  const page = await browser.newPage({ deviceScaleFactor: WEBSITE_SCALE })
  const capture = async (key: PageKey, box: Box) => {
    const file = join(workDir, `${samples.lang}-${layout.width}x${layout.height}-page-${key}.png`)
    await page.setViewportSize({ width: box.width, height: box.height })
    await page.goto(URLS[key])
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: file })
    return file
  }
  const pages = {
    roadmap: await capture("roadmap", layout.page),
    spec: await capture("spec", layout.split[0]),
    prototype: await capture("prototype", layout.split[1]),
    kyoto: await capture("kyoto", layout.page),
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
  { scale = 1, clip }: { readonly scale?: number; readonly clip?: Box } = {},
) => {
  // A file of its own, so the screenshots and fonts it refers to by file URL may load
  const source = join(workDir, "canvas.html")
  writeFileSync(source, html)
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: scale })
  await page.goto(pathToFileURL(source).href)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path,
    ...(clip === undefined
      ? {}
      : { clip: { x: clip.left, y: clip.top, width: clip.width, height: clip.height } }),
  })
  await page.close()
}

/**
 * The browser window at `box`, laid out as `layout`: the side panel, then one page or the two of
 * a split view.
 */
const browserWindow = (
  layout: WindowLayout,
  box: Box,
  sidebar: string,
  pages: string | readonly [string, string],
  veils: ReadonlyArray<Box> = [],
) =>
  windowFrame(
    box,
    [
      image(sidebar, layout.sidebar),
      sidebarDivider(layout),
      ...(typeof pages === "string"
        ? [image(pages, layout.page)]
        : [image(pages[0], layout.split[0]), splitGap(layout), image(pages[1], layout.split[1])]),
      ...veils.map(veil),
    ].join(""),
  )

/** Every screenshot, of a window laid out as `layout` and placed at `stage`. */
const screenshotsOf = (
  layout: WindowLayout,
  stage: Box,
  captures: Captures,
  pages: PageCaptures,
) => {
  const window = (sidebar: string, shown: string | readonly [string, string]) =>
    browserWindow(layout, stage, sidebar, shown)
  const spotlight = spotlightOver(stage)
  return [
    {
      file: "1-spaces",
      shot: "spaces",
      window: window(captures.sidebarSpaces, pages.roadmap),
    },
    {
      file: "2-spotlight",
      shot: "spotlight",
      window: window(captures.sidebarSpaces, pages.roadmap),
      overlay: image(captures.spotlight, spotlight, "floating"),
    },
    {
      file: "3-split-view",
      shot: "split",
      window: window(captures.sidebarSplit, [pages.spec, pages.prototype]),
    },
    {
      file: "4-import",
      shot: "arc",
      window: windowFrame(stage, image(captures.settings, { ...stage, left: 0, top: 0 })),
    },
    {
      file: "5-themes",
      shot: "themes",
      window: window(captures.sidebarThemes, pages.kyoto),
    },
    {
      file: "6-bangs",
      shot: "bangs",
      window: window(captures.sidebarSplit, [pages.spec, pages.prototype]),
      overlay: image(captures.bangs, spotlight, "floating"),
    },
  ] as const satisfies ReadonlyArray<{
    readonly file: string
    readonly shot: Shot
    readonly window: string
    readonly overlay?: string
  }>
}

/** The parts of `outer` around `hole`, which together cover all of `outer` but `hole`. */
const boxesAround = (outer: Box, hole: Box): ReadonlyArray<Box> =>
  [
    { left: outer.left, top: outer.top, width: outer.width, height: hole.top - outer.top },
    {
      left: outer.left,
      top: hole.top + hole.height,
      width: outer.width,
      height: outer.top + outer.height - (hole.top + hole.height),
    },
    { left: outer.left, top: hole.top, width: hole.left - outer.left, height: hole.height },
    {
      left: hole.left + hole.width,
      top: hole.top,
      width: outer.left + outer.width - (hole.left + hole.width),
      height: hole.height,
    },
  ].filter((box) => box.width > 0 && box.height > 0)

/**
 * The website's screenshots. Most wash out what they aren't about, such as the page behind the
 * Command Palette or the sidebar beside a split view but for the split view's own row.
 */
const websiteScreenshotsOf = (captures: Captures, pages: PageCaptures) => {
  const layout = WEBSITE_WINDOW
  const stage = WEBSITE_STAGE
  const whole: Box = { left: 0, top: 0, width: layout.width, height: layout.height }
  const beyondSidebar: Box = {
    left: layout.sidebar.width,
    top: 0,
    width: layout.width - layout.sidebar.width,
    height: layout.height,
  }
  const spotlight = spotlightOver(stage)
  const split = [pages.spec, pages.prototype] as const
  const window = (
    sidebar: string,
    shown: string | readonly [string, string],
    veils: ReadonlyArray<Box> = [],
  ) => browserWindow(layout, stage, sidebar, shown, veils)
  return [
    { file: "1-spaces", window: window(captures.sidebarSpaces, pages.roadmap) },
    {
      file: "2-spotlight",
      window: window(captures.sidebarSpaces, pages.roadmap, [whole]),
      overlay: image(captures.spotlight, spotlight, "floating"),
    },
    {
      file: "3-split-view",
      window: window(
        captures.sidebarTemporarySplit,
        split,
        boxesAround(layout.sidebar, captures.temporarySplitRow),
      ),
    },
    {
      file: "3-split-pinned",
      window: window(
        captures.sidebarSplit,
        split,
        boxesAround(layout.sidebar, captures.pinnedSplitRow),
      ),
    },
    {
      file: "4-import",
      window: windowFrame(
        stage,
        image(captures.settings, whole) + veil({ ...whole, width: captures.settingsNavWidth }),
      ),
    },
    {
      file: "5-themes",
      window: window(captures.sidebarThemes, pages.kyoto, [beyondSidebar]),
    },
    {
      file: "6-bangs",
      window: window(captures.sidebarSplit, split, [whole]),
      overlay: image(captures.bangs, spotlight, "floating"),
    },
    { file: "7-personal", window: window(captures.sidebarPersonal, pages.kyoto) },
  ] as const satisfies ReadonlyArray<{
    readonly file: string
    readonly window: string
    readonly overlay?: string
  }>
}

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
        { ...STORE_WINDOW.sidebar, left: 252, top: 36 },
        // From the Favorites down, where the rows tell what Katip does at this size
        image(captures.sidebarSpaces, { ...STORE_WINDOW.sidebar, top: -40 }),
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
        STORE_WINDOW,
        { ...STAGE, left: 640, top: 72 },
        captures.sidebarSpaces,
        pages.roadmap,
      ),
    }),
    MARQUEE,
    join(promoDir, "marquee.png"),
  )
}

const renderSocialCard = (
  browser: Browser,
  workDir: string,
  samples: LocaleSamples,
  captures: Captures,
  pages: PageCaptures,
) => {
  const socialDir = join(OUTPUT_DIR, "social")
  mkdirSync(socialDir, { recursive: true })
  return render(
    browser,
    workDir,
    socialCardHtml({
      lang: samples.lang,
      headline: samples.socialCard.headline,
      subtitle: samples.socialCard.subtitle,
      window: browserWindow(
        STORE_WINDOW,
        { ...STAGE, left: 600, top: 64 },
        captures.sidebarSpaces,
        pages.roadmap,
      ),
    }),
    SOCIAL_CARD,
    join(socialDir, `${samples.lang}.png`),
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

/** Seeds a fresh profile with `samples` and screenshots everything for windows laid out as `layout`. */
const captureFor = async (
  samples: LocaleSamples,
  layout: WindowLayout,
  stage: Box,
  gmail?: Awaited<ReturnType<typeof serveGmailFeed>>,
) => {
  sites.show(samples)
  // One list of host rules: Chrome keeps only the last --host-resolver-rules it's given
  const args =
    gmail === undefined
      ? sites.args
      : [
          ...sites.args.map((arg) =>
            arg.startsWith("--host-resolver-rules=") ? `${arg},${gmail.hostRule}` : arg,
          ),
          ...gmail.args,
        ]
  const session = await launchSession(
    samples,
    args,
    layout,
    gmail === undefined
      ? {}
      : { extensionDir: extensionWithGmailAccess(workDir), liveFolder: true },
  )
  const captures = await seed(session, workDir)
    .then(() => captureScenes(session, workDir, stage))
    .finally(session.close)
  return { captures, pages: await capturePages(plain, samples, workDir, layout) }
}

const emptyDirectory = (dir: string) => {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}

try {
  for (const samples of LOCALES) {
    const { captures, pages } = await captureFor(samples, STORE_WINDOW, STAGE)
    const outDir = join(OUTPUT_DIR, "screenshots", samples.lang)
    emptyDirectory(outDir)
    for (const { file, shot, ...framed } of screenshotsOf(STORE_WINDOW, STAGE, captures, pages)) {
      const html = screenshotHtml({
        lang: samples.lang,
        caption: samples.captions[shot],
        ...framed,
      })
      await render(plain, workDir, html, CANVAS, join(outDir, `${file}.png`))
    }
    if (samples.lang === "en") await renderPromos(plain, workDir, samples, captures, pages)
    await renderSocialCard(plain, workDir, samples, captures, pages)
  }

  // The website is in English only, and sets what the store's captions say as text of its own
  const english = LOCALES.find((samples) => samples.lang === "en")
  if (english === undefined) throw new Error("There are no English samples for the website")
  const gmail = await serveGmailFeed(workDir)
  const { captures, pages } = await captureFor(
    english,
    WEBSITE_WINDOW,
    WEBSITE_STAGE,
    gmail,
  ).finally(gmail.close)
  const websiteRoot = join(OUTPUT_DIR, "website-screenshots")
  rmSync(websiteRoot, { recursive: true, force: true })
  const websiteDir = join(websiteRoot, english.lang)
  emptyDirectory(websiteDir)
  for (const { file, window, ...rest } of websiteScreenshotsOf(captures, pages)) {
    const html = websiteScreenshotHtml({
      lang: english.lang,
      window,
      ...("overlay" in rest ? { overlay: rest.overlay } : {}),
    })
    await render(plain, workDir, html, WEBSITE_WINDOW, join(websiteDir, `${file}.png`), {
      scale: WEBSITE_SCALE,
    })
  }
} finally {
  await plain.close()
  await sites.close()
  rmSync(workDir, { recursive: true, force: true })
}
