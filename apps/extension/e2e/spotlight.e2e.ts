import type { BrowserContext, Page, Worker } from "@playwright/test"
import { expect, test } from "./fixtures"
import { openPages, pagesInBrowser, pinnedBookmarks, temporaryTitles } from "./sidebar-actions"

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

test.fixme("choosing a closed pin by name opens it as that pin's tab", () => {})
test.fixme("choosing a Space by name switches to it", () => {})
test.fixme("choosing a bookmark opens it as a temporary tab of the shown Space", () => {})
test.fixme("with history search enabled, browsing history appears in the suggestions", () => {})
test.fixme("a query starting with > searches commands only", () => {})
test.fixme("Ctrl+N / Ctrl+P move the selection down and up", () => {})
test.fixme("Escape closes without doing anything", () => {})
