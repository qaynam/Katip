import type { Worker } from "@playwright/test"
import { expect, test } from "./fixtures"
import {
  isSplitViewAvailable,
  openPages,
  pagesInBrowser,
  pinnedBookmarks,
  seedPins,
  temporaryTitles,
} from "./sidebar-actions"

/**
 * Activates the tab at `url`, then fires `chrome.commands.onCommand` with the same arguments as
 * pressing the shortcut on that tab.
 */
const pressShortcutOn = (background: Worker, url: string, command: string) =>
  // Not a key press: headless Chrome never delivers extension shortcuts, so call the registered
  // listeners directly with the arguments Chrome would pass
  background.evaluate(
    async ({ url, command }) => {
      const [target] = await chrome.tabs.query({ url })
      if (target?.id === undefined) throw new Error(`no tab open at ${url}`)
      const active = await chrome.tabs.update(target.id, { active: true })
      const onCommand = chrome.commands.onCommand as unknown as {
        dispatch: (command: string, tab: chrome.tabs.Tab | undefined) => void
      }
      onCommand.dispatch(command, active)
    },
    { url, command },
  )

test.beforeEach(async ({ sidebar }) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
})

test("quick-pin-toggle on a temporary tab adds it as a pin at the end of the pinned list", async ({
  site,
  sidebar,
  background,
}) => {
  await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
  await openPages(background, [`${site}/a`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /a"])

  await pressShortcutOn(background, `${site}/a`, "quick-pin-toggle")

  await expect.poll(() => pinnedBookmarks(background)).toStrictEqual(["Docs", "Page /a"])
  await expect(temporaryTitles(sidebar)).toHaveCount(0)
})

test("quick-pin-toggle on a pinned tab unpins it back to a temporary tab", async ({
  site,
  sidebar,
  background,
}) => {
  await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
  const pinned = sidebar.getByRole("region", { name: "Pinned" })
  await pinned.getByRole("button", { name: "Docs" }).click()
  await expect(pinned.getByRole("button", { name: "Close Tab" })).toBeVisible()

  await pressShortcutOn(background, `${site}/docs`, "quick-pin-toggle")

  await expect.poll(() => pinnedBookmarks(background)).toStrictEqual([])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /docs"])
})

test("quick-pin-toggle on a split view tab makes a split pin holding both tabs", async ({
  site,
  sidebar,
  background,
}) => {
  test.skip(
    !(await isSplitViewAvailable(background)),
    "Chrome without the split view API (154 or earlier)",
  )
  await openPages(background, [`${site}/a`, `${site}/b`])
  await background.evaluate(async (site) => {
    const ids = (await chrome.tabs.query({}))
      .filter((tab) => (tab.pendingUrl ?? tab.url ?? "").startsWith(site))
      .flatMap((tab) => (tab.id === undefined ? [] : [tab.id]))
    const [left, right] = ids
    if (left === undefined || right === undefined) throw new Error("no tabs to split")
    await chrome.tabs.createSplit([left, right])
  }, site)
  await expect(sidebar.getByRole("group", { name: "Page /a" })).toBeVisible()

  await pressShortcutOn(background, `${site}/b`, "quick-pin-toggle")

  await expect
    .poll(() => pinnedBookmarks(background))
    .toStrictEqual(["Page /a | Page /b[Page /a Page /b]"])
})

test("next-tab-in-space activates the next tab in display order, wrapping from the last to the first", async ({
  site,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`, `${site}/b`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /b", "Page /a"])

  await pressShortcutOn(background, `${site}/b`, "next-tab-in-space")
  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a active", "/b"])
  await pressShortcutOn(background, `${site}/a`, "next-tab-in-space")

  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a", "/b active"])
})

test("previous-tab-in-space activates the previous tab in display order", async ({
  site,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`, `${site}/b`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /b", "Page /a"])

  await pressShortcutOn(background, `${site}/a`, "previous-tab-in-space")

  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a", "/b active"])
})

test("open-spotlight opens Spotlight in a separate popup window", async ({
  site,
  context,
  background,
}) => {
  await openPages(background, [`${site}/a`])
  const opened = context.waitForEvent("page", (page) => page.url().includes("/spotlight/"))

  await pressShortcutOn(background, `${site}/a`, "open-spotlight")

  const spotlight = await opened
  await expect(spotlight.getByRole("combobox")).toBeFocused()
  await expect
    .poll(() =>
      background.evaluate(async () =>
        (await chrome.windows.getAll({ populate: true }))
          .filter((window) => window.tabs?.some((tab) => (tab.url ?? "").includes("/spotlight/")))
          .map((window) => window.type),
      ),
    )
    .toStrictEqual(["popup"])
})

test.fixme("copy-current-url copies the active tab's URL and shows a notice on the page", () => {})
test.fixme("copy-current-url-as-markdown copies it as [title](URL)", () => {})
test.fixme("_execute_action (Alt+S) opens the side panel", () => {})
