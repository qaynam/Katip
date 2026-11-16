import type { Page, Worker } from "@playwright/test"
import { expect, test } from "./fixtures"
import { createSpace, openPages, pagesInBrowser, temporaryTitles } from "./sidebar-actions"

const pinInChrome = (background: Worker, url: string) =>
  background.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url })
    if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { pinned: true })
  }, url)

const activateInChrome = (background: Worker, url: string) =>
  background.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url })
    if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { active: true })
  }, url)

const favorites = (sidebar: Page) => sidebar.getByRole("region", { name: "Favorites" })

const switchTo = (sidebar: Page, name: string) =>
  sidebar.getByRole("navigation", { name: "Switch Space" }).getByRole("button", { name }).click()

test.beforeEach(async ({ sidebar }) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
})

test("a new Space starts with no Favorites, and the Favorites of the Space left stay open in Chrome, unpinned", async ({
  site,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`])
  await expect(temporaryTitles(sidebar)).toHaveCount(1)
  await pinInChrome(background, `${site}/a`)
  await expect(favorites(sidebar).getByRole("button", { name: "Page /a" })).toBeVisible()

  await createSpace(sidebar, "Work")

  await expect(
    favorites(sidebar).getByText("Drag tabs here to add them to Favorites"),
  ).toBeVisible()
  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a"])
})

test("switching back to a Space pins its Favorites' tabs in Chrome again, and each Space keeps its own", async ({
  site,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`])
  await expect(temporaryTitles(sidebar)).toHaveCount(1)
  await pinInChrome(background, `${site}/a`)
  await expect(favorites(sidebar).getByRole("button", { name: "Page /a" })).toBeVisible()
  await createSpace(sidebar, "Work")
  await openPages(background, [`${site}/b`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /b"])
  await pinInChrome(background, `${site}/b`)
  await expect(favorites(sidebar).getByRole("button", { name: "Page /b" })).toBeVisible()
  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/b pinned", "/a"])

  await switchTo(sidebar, "Home")

  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
  await expect(favorites(sidebar).getByRole("button")).toHaveAccessibleName("Page /a")
  await expect
    .poll(() => pagesInBrowser(background, site))
    .toStrictEqual(["/a pinned active", "/b"])
})

test("activating a Favorite's tab of another Space in Chrome's tab strip shows its Space", async ({
  site,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`])
  await expect(temporaryTitles(sidebar)).toHaveCount(1)
  await pinInChrome(background, `${site}/a`)
  await expect(favorites(sidebar).getByRole("button", { name: "Page /a" })).toBeVisible()
  await createSpace(sidebar, "Work")

  await activateInChrome(background, `${site}/a`)

  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a pinned active"])
})
