import { expect, test } from "./fixtures"
import {
  chooseFromMenu,
  openPages,
  pagesInBrowser,
  pinnedBookmarks,
  seedPins,
  temporaryTitles,
} from "./sidebar-actions"

test.beforeEach(async ({ sidebar }) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
})

test.describe("temporary tab", () => {
  test("clicking it activates the tab", async ({ site, sidebar, background }) => {
    await openPages(background, [`${site}/a`, `${site}/b`])

    await sidebar
      .getByRole("region", { name: "Temporary tabs" })
      .getByRole("button", { name: "Page /a" })
      .click()

    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a active", "/b"])
  })

  test("New Tab opens an active tab as a temporary tab of the shown Space", async ({
    sidebar,
    background,
  }) => {
    await sidebar.getByRole("button", { name: "New Tab" }).click()

    await expect(
      sidebar
        .getByRole("region", { name: "Temporary tabs" })
        .getByRole("listitem")
        .getByRole("button", { name: "New Tab" }),
    ).toHaveCount(1)
    await expect
      .poll(() =>
        background.evaluate(async () => {
          const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
          return active?.pendingUrl ?? active?.url
        }),
      )
      .toMatch(/^chrome:\/\/newtab/)
  })

  test("Pin in the menu adds it as a pin at the end of the pinned list", async ({
    site,
    sidebar,
    background,
  }) => {
    await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
    await openPages(background, [`${site}/a`])
    const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })

    await chooseFromMenu(sidebar, temporary.getByRole("button", { name: "Page /a" }), "Pin")

    await expect.poll(() => pinnedBookmarks(background)).toStrictEqual(["Docs", "Page /a"])
    await expect(temporaryTitles(sidebar)).toHaveCount(0)
  })

  test("Add to Favorites in the menu pins it in Chrome and lists it in Favorites", async ({
    site,
    sidebar,
    background,
  }) => {
    await openPages(background, [`${site}/a`])
    const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })

    await chooseFromMenu(
      sidebar,
      temporary.getByRole("button", { name: "Page /a" }),
      "Add to Favorites",
    )

    await expect(
      sidebar.getByRole("region", { name: "Favorites" }).getByRole("button", { name: "Page /a" }),
    ).toBeVisible()
    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a pinned"])
  })

  test("the close button closes only that tab", async ({ site, sidebar, background }) => {
    await openPages(background, [`${site}/a`, `${site}/b`])
    await expect(temporaryTitles(sidebar)).toHaveCount(2)

    await sidebar
      .getByRole("region", { name: "Temporary tabs" })
      .getByRole("listitem")
      .filter({ hasText: "Page /a" })
      .getByRole("button", { name: "Close Tab" })
      .click()

    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/b"])
  })

  test("Clear closes the Space's temporary tabs and keeps pinned tabs", async ({
    site,
    sidebar,
    background,
  }) => {
    await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
    await openPages(background, [`${site}/a`, `${site}/b`])
    const pinned = sidebar.getByRole("region", { name: "Pinned" })
    await pinned.getByRole("button", { name: "Docs" }).click()
    await expect(pinned.getByRole("button", { name: "Close Tab" })).toBeVisible()

    await sidebar.getByRole("button", { name: "Clear", exact: true }).click()

    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/docs active"])
  })
})

test.describe("pin", () => {
  test("confirming Delete Pinned Tab in a closed pin's menu deletes the bookmark", async ({
    site,
    sidebar,
    background,
  }) => {
    await seedPins(background, [
      { title: "Docs", url: `${site}/docs` },
      { title: "Mail", url: `${site}/mail` },
    ])
    const pinned = sidebar.getByRole("region", { name: "Pinned" })

    await chooseFromMenu(sidebar, pinned.getByRole("button", { name: "Docs" }), "Delete Pinned Tab")
    await sidebar.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click()

    await expect.poll(() => pinnedBookmarks(background)).toStrictEqual(["Mail"])
    await expect(pinned.getByRole("button", { name: "Docs" })).toHaveCount(0)
  })

  test("New Folder in the Space menu adds a folder with the entered name at the end of the pinned list", async ({
    site,
    sidebar,
    background,
  }) => {
    await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])

    await sidebar.getByRole("button", { name: "Space menu" }).click()
    await sidebar.getByRole("menuitem", { name: "New Folder" }).click()
    await sidebar.getByRole("textbox", { name: "Folder name" }).fill("Work")
    await sidebar.keyboard.press("Enter")

    await expect.poll(() => pinnedBookmarks(background)).toStrictEqual(["Docs", "Work[]"])
  })

  test("Unpin in an open pin's menu makes it a temporary tab and deletes the bookmark", async ({
    site,
    sidebar,
    background,
  }) => {
    await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
    const pinned = sidebar.getByRole("region", { name: "Pinned" })
    await pinned.getByRole("button", { name: "Docs" }).click()
    await expect(pinned.getByRole("button", { name: "Close Tab" })).toBeVisible()

    await chooseFromMenu(sidebar, pinned.getByRole("button", { name: "Docs" }), "Unpin")

    await expect(temporaryTitles(sidebar)).toHaveText(["Page /docs"])
    await expect.poll(() => pinnedBookmarks(background)).toStrictEqual([])
  })

  test("closing an open pin's tab keeps it as a closed pin that reopens on click", async ({
    site,
    sidebar,
    background,
  }) => {
    await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
    const pinned = sidebar.getByRole("region", { name: "Pinned" })
    await pinned.getByRole("button", { name: "Docs" }).click()
    await pinned.getByRole("button", { name: "Close Tab" }).click()
    await expect(pinned.getByRole("button", { name: "Close Tab" })).toHaveCount(0)
    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual([])

    await pinned.getByRole("button", { name: "Docs" }).click()

    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/docs active"])
    await expect.poll(() => pinnedBookmarks(background)).toStrictEqual(["Docs"])
  })

  test("the back button of a pin that navigated away returns it to the pinned URL", async ({
    site,
    sidebar,
    background,
  }) => {
    await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
    const pinned = sidebar.getByRole("region", { name: "Pinned" })
    await pinned.getByRole("button", { name: "Docs" }).click()
    await expect(pinned.getByRole("button", { name: "Close Tab" })).toBeVisible()
    await background.evaluate(async (site) => {
      const [tab] = await chrome.tabs.query({ url: `${site}/docs` })
      if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { url: `${site}/elsewhere` })
    }, site)

    await pinned.getByRole("button", { name: "Go back to the pinned URL" }).click()

    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/docs active"])
  })

  test("Replace Pinned URL on a navigated pin updates its bookmark to the current URL", async ({
    site,
    sidebar,
    background,
  }) => {
    await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
    const pinned = sidebar.getByRole("region", { name: "Pinned" })
    await pinned.getByRole("button", { name: "Docs" }).click()
    await expect(pinned.getByRole("button", { name: "Close Tab" })).toBeVisible()
    await background.evaluate(async (site) => {
      const [tab] = await chrome.tabs.query({ url: `${site}/docs` })
      if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { url: `${site}/elsewhere` })
    }, site)
    await expect(pinned.getByRole("button", { name: "Go back to the pinned URL" })).toBeVisible()

    await chooseFromMenu(
      sidebar,
      pinned.getByRole("button", { name: "Docs" }),
      "Replace Pinned URL with Current URL",
    )

    await expect(pinned.getByRole("button", { name: "Go back to the pinned URL" })).toHaveCount(0)
    await expect
      .poll(() =>
        background.evaluate(async () => (await chrome.bookmarks.search({ title: "Docs" }))[0]?.url),
      )
      .toBe(`${site}/elsewhere`)
  })
})

test.fixme("middle-clicking a tab closes it", () => {})
test.fixme("audible tabs show a speaker and muted tabs show a muted speaker", () => {})
test.fixme("clearing a temporary tab's name reverts to the page title", () => {})
test.fixme("loading tabs show a loading indicator", () => {})
