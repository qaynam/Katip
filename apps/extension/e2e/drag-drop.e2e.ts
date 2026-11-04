import { expect, test } from "./fixtures"
import {
  dragOnto,
  openPages,
  pagesInBrowser,
  pinnedBookmarks,
  seedPins,
  temporaryTitles,
} from "./sidebar-actions"

test.beforeEach(async ({ sidebar }) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
})

test.describe("dragging a temporary tab", () => {
  test("dropping it on the pinned area makes it a pin and bookmarks it in the Space folder", async ({
    site,
    sidebar,
    background,
  }) => {
    await openPages(background, [`${site}/a`])
    const pinned = sidebar.getByRole("region", { name: "Pinned" })
    const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })

    await dragOnto(
      temporary.getByRole("button", { name: "Page /a" }),
      pinned.getByText("Drag tabs here to pin them"),
      0.5,
    )

    await expect(pinned.getByRole("button", { name: "Page /a" })).toBeVisible()
    await expect(temporary.getByRole("button", { name: "Page /a" })).toHaveCount(0)
    await expect.poll(() => pinnedBookmarks(background)).toStrictEqual(["Page /a"])
  })

  test("dropping it on the middle of a folder makes it a pin inside the folder", async ({
    site,
    sidebar,
    background,
  }) => {
    await seedPins(background, [{ title: "Work" }])
    await openPages(background, [`${site}/a`])
    const pinned = sidebar.getByRole("region", { name: "Pinned" })

    await dragOnto(
      sidebar
        .getByRole("region", { name: "Temporary tabs" })
        .getByRole("button", { name: "Page /a" }),
      pinned.getByRole("button", { name: "Work" }),
      0.5,
    )

    await expect.poll(() => pinnedBookmarks(background)).toStrictEqual(["Work[Page /a]"])
  })

  test("dropping it on Favorites pins it in Chrome and removes it from the temporary tabs", async ({
    site,
    sidebar,
    background,
  }) => {
    await openPages(background, [`${site}/a`])
    const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })

    await dragOnto(
      temporary.getByRole("button", { name: "Page /a" }),
      sidebar.getByText("Drag tabs here to add them to Favorites"),
      0.5,
    )

    await expect(
      sidebar.getByRole("region", { name: "Favorites" }).getByRole("button", { name: "Page /a" }),
    ).toBeVisible()
    await expect(temporary.getByRole("button", { name: "Page /a" })).toHaveCount(0)
    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a pinned"])
  })

  test("dropping it on the upper part of another temporary tab places it above that tab", async ({
    site,
    sidebar,
    background,
  }) => {
    await openPages(background, [`${site}/a`, `${site}/b`, `${site}/c`])
    const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })
    await expect(temporaryTitles(sidebar)).toHaveText(["Page /c", "Page /b", "Page /a"])

    await dragOnto(
      temporary.getByRole("button", { name: "Page /a" }),
      temporary.getByRole("button", { name: "Page /c" }),
      0.1,
    )

    await expect(temporaryTitles(sidebar)).toHaveText(["Page /a", "Page /c", "Page /b"])
    // Reversed because new tabs show at the top by default: higher in the list is further right in Chrome
    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/b", "/c", "/a"])
  })
})

test.describe("dragging a pin", () => {
  test("dropping an open pin on a temporary tab unpins it back to a temporary tab and deletes the bookmark", async ({
    site,
    sidebar,
    background,
  }) => {
    await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
    await openPages(background, [`${site}/a`])
    const pinned = sidebar.getByRole("region", { name: "Pinned" })
    const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })
    await pinned.getByRole("button", { name: "Docs" }).click()
    await expect(pinned.getByRole("button", { name: "Close Tab" })).toBeVisible()

    await dragOnto(
      pinned.getByRole("button", { name: "Docs" }),
      temporary.getByRole("button", { name: "Page /a" }),
      0.1,
    )

    await expect(temporary.getByRole("button", { name: "Page /docs" })).toBeVisible()
    await expect.poll(() => pinnedBookmarks(background)).toStrictEqual([])
  })

  test("dropping it on the upper part of another pin places it before that pin and reorders the bookmarks", async ({
    sidebar,
    background,
  }) => {
    await seedPins(background, [
      { title: "One", url: "https://one.example/" },
      { title: "Two", url: "https://two.example/" },
      { title: "Three", url: "https://three.example/" },
    ])
    const pinned = sidebar.getByRole("region", { name: "Pinned" })

    await dragOnto(
      pinned.getByRole("button", { name: "Three" }),
      pinned.getByRole("button", { name: "One" }),
      0.1,
    )

    await expect.poll(() => pinnedBookmarks(background)).toStrictEqual(["Three", "One", "Two"])
  })
})

test.describe("dragging a Favorite", () => {
  test("dropping it on a temporary tab unpins it in Chrome and makes it a temporary tab", async ({
    site,
    sidebar,
    background,
  }) => {
    await openPages(background, [`${site}/a`, `${site}/b`])
    await background.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url })
      if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { pinned: true })
    }, `${site}/a`)
    const favorites = sidebar.getByRole("region", { name: "Favorites" })
    const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })
    await expect(favorites.getByRole("button", { name: "Page /a" })).toBeVisible()

    await dragOnto(
      favorites.getByRole("button", { name: "Page /a" }),
      temporary.getByRole("button", { name: "Page /b" }),
      0.9,
    )

    await expect(temporaryTitles(sidebar)).toHaveText(["Page /b", "Page /a"])
    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a", "/b"])
    await expect(favorites.getByRole("button")).toHaveCount(0)
  })

  test("dropping it on the pinned area unpins it in Chrome and makes it a pin", async ({
    site,
    sidebar,
    background,
  }) => {
    await openPages(background, [`${site}/a`])
    await background.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url })
      if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { pinned: true })
    }, `${site}/a`)
    const favorites = sidebar.getByRole("region", { name: "Favorites" })
    const pinned = sidebar.getByRole("region", { name: "Pinned" })
    await expect(favorites.getByRole("button", { name: "Page /a" })).toBeVisible()

    await dragOnto(
      favorites.getByRole("button", { name: "Page /a" }),
      pinned.getByText("Drag tabs here to pin them"),
      0.5,
    )

    await expect(pinned.getByRole("button", { name: "Page /a" })).toBeVisible()
    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a"])
    await expect.poll(() => pinnedBookmarks(background)).toStrictEqual(["Page /a"])
    await expect(favorites.getByRole("button")).toHaveCount(0)
  })
})

test.fixme("dropping a split pin on the middle of a folder moves it into the folder as a split pin", () => {})
test.fixme("moving a folder into another Space's folder moves its open pinned tabs to that Space", () => {})
test.fixme("while syncing with tab groups, a folder cannot be dropped deeper than the second level", () => {})
test.fixme("pressing Escape while dragging cancels without changes", () => {})
