import type { BrowserContext, Page, Worker } from "@playwright/test"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { launchWithExtension } from "./browser-launch"
import { EXTENSION_DIR } from "./extension-dir"
import { expect, test } from "./fixtures"
import {
  isSplitViewAvailable,
  openPages,
  pagesInBrowser,
  pinnedBookmarks,
  temporaryTitles,
} from "./sidebar-actions"

/**
 * Activates the tab at `url`, then opens Spotlight with the sidebar's search button.
 * The tab must have finished loading (its page name shows in the sidebar).
 */
const openSpotlightOver = async (
  context: BrowserContext,
  sidebar: Page,
  background: Worker,
  url: string,
) => {
  await background.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url })
    if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { active: true })
  }, url)
  const opened = context.waitForEvent("page", (page) => page.url().includes("/spotlight/"))
  await sidebar.getByRole("button", { name: "Search" }).click()
  const spotlight = await opened
  await expect(spotlight.getByRole("combobox")).toBeFocused()
  return spotlight
}

const choose = async (spotlight: Page, query: string, option: string | RegExp) => {
  await spotlight.getByRole("combobox").fill(query)
  await spotlight
    .getByRole("listbox", { name: "Suggestions" })
    .getByRole("option", { name: option })
    .click()
}

/** Adds a command in the settings that searches `${site}/search` for what follows `!here`. */
const addSearchCommand = async (context: BrowserContext, background: Worker, site: string) => {
  const settings = await context.newPage()
  await settings.goto(new URL("options/index.html", background.url()).href)
  await settings.getByRole("tab", { name: "Spotlight" }).click()
  await settings.getByRole("button", { name: "Add Command" }).click()
  const form = settings.getByRole("form", { name: "New Command" })
  await form.getByLabel("Name").fill("Search the test site")
  await form.getByLabel("URL").fill(`${site}/search?q=%s`)
  await form.getByLabel("Keyword").fill("here")
  await form.getByRole("button", { name: "Save" }).click()
  await expect(settings.getByText("Search the test site")).toBeVisible()
  await settings.close()
}

const searchedOnSite = (background: Worker, site: string) =>
  background.evaluate(
    async (site) =>
      (await chrome.tabs.query({}))
        .map((tab) => tab.pendingUrl ?? tab.url ?? "")
        .filter((url) => url.startsWith(`${site}/search`)),
    site,
  )

// Not by turning history search on in the settings: Chrome grants an optional permission only
// through its prompt, which a test can't answer
/** A copy of the extension that holds the history permission from the moment it's installed. */
const extensionWithHistoryAccess = async () => {
  const dir = await mkdtemp(join(tmpdir(), "katip-e2e-history-"))
  await cp(EXTENSION_DIR, dir, { recursive: true })
  const manifestPath = join(dir, "manifest.json")
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as chrome.runtime.ManifestV3
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...manifest,
      permissions: [...(manifest.permissions ?? []), "history"],
      optional_permissions: (manifest.optional_permissions ?? []).filter(
        (permission) => permission !== "history",
      ),
    }),
  )
  return dir
}

const testWithHistoryAccess = test.extend({
  // eslint-disable-next-line no-empty-pattern -- Playwright reads dependencies from the destructured argument
  context: async ({}, use) => {
    const dir = await extensionWithHistoryAccess()
    const { context, close } = await launchWithExtension(dir)
    await use(context)
    await close()
    await rm(dir, { recursive: true, force: true })
  },
})

/** The paths of the local site's pages in the browsing history, most recently visited first. */
const pathsInHistory = (background: Worker, site: string) =>
  background.evaluate(
    async (site) =>
      (await chrome.history.search({ text: "", startTime: 0 }))
        .filter((page) => page.url?.startsWith(site) === true && page.title !== "")
        .map((page) => new URL(page.url ?? "").pathname),
    site,
  )

test.beforeEach(async ({ sidebar }) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
})

test("choosing an open tab by name activates it and closes Spotlight", async ({
  site,
  context,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`, `${site}/b`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /b", "Page /a"])
  const spotlight = await openSpotlightOver(context, sidebar, background, `${site}/a`)

  await choose(spotlight, "Page /b", /^Page \/b\s+Home/)

  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a", "/b active"])
  await expect.poll(() => spotlight.isClosed()).toBe(true)
})

test("Pin Tab pins the active tab", async ({ site, context, sidebar, background }) => {
  await openPages(background, [`${site}/a`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /a"])
  const spotlight = await openSpotlightOver(context, sidebar, background, `${site}/a`)

  await choose(spotlight, "Pin Tab", /^Pin Tab\s+Command/)

  await expect.poll(() => pinnedBookmarks(background)).toStrictEqual(["Page /a"])
})

test("Duplicate Tab opens a duplicate right after the active tab as a temporary tab of the same Space", async ({
  site,
  context,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`, `${site}/b`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /b", "Page /a"])
  const spotlight = await openSpotlightOver(context, sidebar, background, `${site}/a`)

  await choose(spotlight, "Duplicate Tab", /^Duplicate Tab\s+Command/)

  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a", "/a active", "/b"])
  await expect(temporaryTitles(sidebar)).toHaveCount(3)
})

test("entering a URL and pressing Enter opens it as a temporary tab of the shown Space", async ({
  site,
  context,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /a"])
  const spotlight = await openSpotlightOver(context, sidebar, background, `${site}/a`)

  await spotlight.getByRole("combobox").fill(`${site}/typed`)
  await expect(spotlight.getByRole("option").first()).toContainText("Open")
  await spotlight.keyboard.press("Enter")

  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a", "/typed active"])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /typed", "Page /a"])
})

test("a bang from the bundled list is offered for the trigger typed after !", async ({
  site,
  context,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /a"])
  const spotlight = await openSpotlightOver(context, sidebar, background, `${site}/a`)

  await spotlight.getByRole("combobox").fill("!gh")

  await expect(spotlight.getByRole("option").first()).toContainText("Open GitHub")
})

test("a command added in the settings searches the site for what follows its keyword", async ({
  site,
  context,
  sidebar,
  background,
}) => {
  await addSearchCommand(context, background, site)
  await openPages(background, [`${site}/a`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /a"])
  const spotlight = await openSpotlightOver(context, sidebar, background, `${site}/a`)

  await spotlight.getByRole("combobox").fill("!here hello world")
  await expect(spotlight.getByRole("option").first()).toContainText("hello world")
  await spotlight.keyboard.press("Enter")

  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a", "/search active"])
  expect(await searchedOnSite(background, site)).toStrictEqual([`${site}/search?q=hello+world`])
})

test("in a site, Enter pressed right after typing fast searches the site for all that was typed", async ({
  site,
  context,
  sidebar,
  background,
}) => {
  await addSearchCommand(context, background, site)
  await openPages(background, [`${site}/a`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /a"])
  const spotlight = await openSpotlightOver(context, sidebar, background, `${site}/a`)
  const field = spotlight.getByRole("combobox")
  await field.pressSequentially("!here ")
  await expect(field).toHaveAccessibleName("Search the test site: what to search for")

  await spotlight.keyboard.type("hello world")
  await spotlight.keyboard.press("Enter")

  await expect
    .poll(() => searchedOnSite(background, site))
    .toStrictEqual([`${site}/search?q=hello+world`])
})

test("Split with New Tab splits the active tab with a new tab on its right, shown", async ({
  site,
  context,
  sidebar,
  background,
}) => {
  test.skip(
    !(await isSplitViewAvailable(background)),
    "Chrome without the split view API (154 or earlier)",
  )
  await openPages(background, [`${site}/a`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /a"])
  const spotlight = await openSpotlightOver(context, sidebar, background, `${site}/a`)

  await choose(spotlight, "split with new tab", /^Split with New Tab/)

  await expect
    .poll(() =>
      background.evaluate(async (site) => {
        const split = (await chrome.tabs.query({})).filter(
          (tab) => tab.splitViewId !== undefined && tab.splitViewId !== -1,
        )
        return split
          .sort((one, other) => one.index - other.index)
          .map((tab) => {
            const url = tab.pendingUrl ?? tab.url ?? ""
            const page = url.startsWith(site) ? url.slice(site.length) : "new tab"
            return tab.active ? `${page} active` : page
          })
      }, site),
    )
    .toStrictEqual(["/a", "new tab active"])
})

testWithHistoryAccess(
  "Search History finds a closed page in the history through a typo in its title, and opens it",
  async ({ site, context, sidebar, background }) => {
    await openPages(background, [`${site}/documentation`, `${site}/a`])
    await expect(temporaryTitles(sidebar)).toHaveText(["Page /a", "Page /documentation"])
    await background.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url })
      if (tab?.id !== undefined) await chrome.tabs.remove(tab.id)
    }, `${site}/documentation`)
    await expect.poll(() => pathsInHistory(background, site)).toContain("/documentation")
    const spotlight = await openSpotlightOver(context, sidebar, background, `${site}/a`)

    await choose(spotlight, "search history", /^Search History/)
    await expect(spotlight.getByRole("combobox")).toHaveAccessibleName("Search browsing history")
    await spotlight.getByRole("combobox").fill("documantation")
    await expect(spotlight.getByRole("option")).toHaveText([/^.?Page \/documentation/])
    await spotlight.keyboard.press("Enter")

    await expect
      .poll(() => pagesInBrowser(background, site))
      .toStrictEqual(["/a", "/documentation active"])
  },
)

test("Search History without the history permission offers to turn it on, opening the settings there", async ({
  site,
  context,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /a"])
  const spotlight = await openSpotlightOver(context, sidebar, background, `${site}/a`)

  await choose(spotlight, "search history", /^Search History/)
  await expect(spotlight.getByRole("option")).toHaveText([/Turn On History Search in Settings/])
  const opened = context.waitForEvent("page", (page) => page.url().includes("/options/"))
  await spotlight.keyboard.press("Enter")

  const settings = await opened
  await expect(settings.getByRole("tab", { name: "Spotlight" })).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await expect(
    settings.getByRole("switch", { name: "Search browsing history too" }),
  ).not.toBeChecked()
})

test.fixme("choosing a closed pin by name opens it as that pin's tab", () => {})
test.fixme("choosing a Space by name switches to it", () => {})
test.fixme("choosing a bookmark opens it as a temporary tab of the shown Space", () => {})
test.fixme("with history search enabled, browsing history appears in the suggestions", () => {})
test.fixme("a query starting with > searches commands only", () => {})
test.fixme("Ctrl+N / Ctrl+P move the selection down and up", () => {})
test.fixme("Escape closes without doing anything", () => {})
