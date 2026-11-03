import type { Page, Worker } from "@playwright/test"
import { expect, test } from "./fixtures"
import {
  chooseFromMenu,
  dragOnto,
  isSplitViewAvailable,
  openPages,
  pagesInBrowser,
  pinnedBookmarks,
  temporaryTitles,
} from "./sidebar-actions"

/** Opens the pages in `paths` and splits the two tabs into a real split view. */
const openSplit = async (background: Worker, site: string, paths: readonly [string, string]) => {
  await openPages(
    background,
    paths.map((path) => `${site}${path}`),
  )
  await background.evaluate(
    async (urls) => {
      const tabs = await chrome.tabs.query({})
      const ids = urls.map((url) => tabs.find((tab) => (tab.pendingUrl ?? tab.url) === url)?.id)
      const [left, right] = ids
      if (left === undefined || right === undefined) throw new Error("no tabs to split")
      await chrome.tabs.createSplit([left, right])
    },
    paths.map((path) => `${site}${path}`),
  )
}

const splitRowOf = (sidebar: Page, title: string) =>
  sidebar
    .getByRole("region", { name: "Temporary tabs" })
    .getByRole("listitem")
    .filter({ has: sidebar.getByRole("group", { name: title }) })

test.describe("on Chrome with the split view API", () => {
  test.beforeEach(async ({ sidebar, background }) => {
    test.skip(
      !(await isSplitViewAvailable(background)),
      "Chrome without the split view API (154 or earlier)",
    )
    await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
  })

  test("dropping a temporary tab onto another splits the browser view and brings the dropped tab to the front", async ({
    site,
    sidebar,
    background,
  }) => {
    await openPages(background, [`${site}/a`, `${site}/b`])
    const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })
    await expect(temporary.getByRole("button", { name: "Page /b" })).toBeVisible()

    await dragOnto(
      temporary.getByRole("button", { name: "Page /b" }),
      temporary.getByRole("button", { name: "Page /a" }),
      0.5,
    )

    await expect
      .poll(() => pagesInBrowser(background, site))
      .toStrictEqual(["/a split", "/b split active"])
  })

  test("a split view row shows both tabs in one row", async ({ site, sidebar, background }) => {
    await openSplit(background, site, ["/a", "/b"])

    await expect(splitRowOf(sidebar, "Page /a").getByRole("group")).toHaveText([
      "Page /a",
      "Page /b",
    ])
  })

  test("Separate Tabs in the split row menu turns it back into two single tabs", async ({
    site,
    sidebar,
    background,
  }) => {
    await openSplit(background, site, ["/a", "/b"])

    await chooseFromMenu(
      sidebar,
      splitRowOf(sidebar, "Page /a").getByRole("group", { name: "Page /a" }),
      "Separate Tabs",
    )

    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a", "/b"])
    await expect(sidebar.getByRole("group", { name: "Page /a" })).toHaveCount(0)
  })

  test("Pin in the split row menu makes a split pin: a folder holding both tabs", async ({
    site,
    sidebar,
    background,
  }) => {
    await openSplit(background, site, ["/a", "/b"])

    await chooseFromMenu(
      sidebar,
      splitRowOf(sidebar, "Page /a").getByRole("group", { name: "Page /a" }),
      "Pin",
    )

    await expect
      .poll(() => pinnedBookmarks(background))
      .toStrictEqual(["Page /a | Page /b[Page /a Page /b]"])
    await expect(temporaryTitles(sidebar)).toHaveCount(0)
  })

  test("dropping a split row on the pinned area makes it a split pin", async ({
    site,
    sidebar,
    background,
  }) => {
    await openSplit(background, site, ["/a", "/b"])

    await dragOnto(
      splitRowOf(sidebar, "Page /a"),
      sidebar.getByRole("region", { name: "Pinned" }).getByText("Drag tabs here to pin them"),
      0.5,
    )

    await expect
      .poll(() => pinnedBookmarks(background))
      .toStrictEqual(["Page /a | Page /b[Page /a Page /b]"])
  })

  test("opening a closed split pin opens both tabs side by side in a split view", async ({
    site,
    sidebar,
    background,
  }) => {
    await openSplit(background, site, ["/a", "/b"])
    await chooseFromMenu(
      sidebar,
      splitRowOf(sidebar, "Page /a").getByRole("group", { name: "Page /a" }),
      "Pin",
    )
    await expect.poll(() => pinnedBookmarks(background)).toHaveLength(1)
    await background.evaluate(async (site) => {
      const ids = (await chrome.tabs.query({}))
        .filter((tab) => (tab.url ?? "").startsWith(site))
        .flatMap((tab) => (tab.id === undefined ? [] : [tab.id]))
      await chrome.tabs.remove(ids)
    }, site)
    const pinned = sidebar.getByRole("region", { name: "Pinned" })
    await expect(pinned.getByRole("button", { name: "Close Tab" })).toHaveCount(0)

    await pinned.getByRole("button", { name: "Page /a" }).click()

    await expect
      .poll(() => pagesInBrowser(background, site))
      .toStrictEqual(["/a split active", "/b split"])
  })

  test("dropping an open split pin on a temporary tab makes it temporary tabs in a split view and deletes the split pin", async ({
    site,
    sidebar,
    background,
  }) => {
    await openPages(background, [`${site}/c`])
    await openSplit(background, site, ["/a", "/b"])
    await chooseFromMenu(
      sidebar,
      splitRowOf(sidebar, "Page /a").getByRole("group", { name: "Page /a" }),
      "Pin",
    )
    await expect.poll(() => pinnedBookmarks(background)).toHaveLength(1)
    const pinnedSplit = sidebar
      .getByRole("region", { name: "Pinned" })
      .getByRole("listitem")
      .filter({ has: sidebar.getByRole("group", { name: "Page /a" }) })

    await dragOnto(
      pinnedSplit,
      sidebar
        .getByRole("region", { name: "Temporary tabs" })
        .getByRole("button", { name: "Page /c" }),
      0.1,
    )

    await expect(temporaryTitles(sidebar)).toHaveText(["Page /a", "Page /b", "Page /c"])
    await expect.poll(() => pinnedBookmarks(background)).toStrictEqual([])
    await expect
      .poll(() => pagesInBrowser(background, site))
      .toStrictEqual(["/c", "/a split", "/b split"])
  })

  test("dropping a split row elsewhere in the temporary tabs keeps it a split view", async ({
    site,
    sidebar,
    background,
  }) => {
    await openPages(background, [`${site}/c`])
    await openSplit(background, site, ["/a", "/b"])
    const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })
    await expect(temporaryTitles(sidebar)).toHaveText(["Page /a", "Page /b", "Page /c"])

    await dragOnto(
      splitRowOf(sidebar, "Page /a"),
      temporary.getByRole("button", { name: "Page /c" }),
      0.9,
    )

    await expect(temporaryTitles(sidebar)).toHaveText(["Page /c", "Page /a", "Page /b"])
    await expect
      .poll(() => pagesInBrowser(background, site))
      .toStrictEqual(["/a split", "/b split", "/c"])
  })
})

test.describe("on Chrome without the split view API", () => {
  test.beforeEach(async ({ sidebar, background }) => {
    test.skip(
      await isSplitViewAvailable(background),
      "Chrome with the split view API (155 or later)",
    )
    await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
  })

  test("dropping a temporary tab onto another does not split and says split view is unsupported", async ({
    site,
    sidebar,
    background,
  }) => {
    await openPages(background, [`${site}/a`, `${site}/b`])
    const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })
    await expect(temporary.getByRole("button", { name: "Page /b" })).toBeVisible()

    await dragOnto(
      temporary.getByRole("button", { name: "Page /b" }),
      temporary.getByRole("button", { name: "Page /a" }),
      0.5,
    )

    await expect(sidebar.getByText("This browser doesn’t support split view")).toBeVisible()
    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a", "/b"])
  })
})
