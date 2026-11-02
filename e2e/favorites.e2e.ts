import { expect, test } from "./fixtures"
import { openPages, pagesInBrowser, temporaryTitles } from "./sidebar-actions"

test.beforeEach(async ({ sidebar }) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
})

test("a tab pinned in Chrome shows in Favorites, not in the temporary tabs", async ({
  site,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`, `${site}/b`])
  await expect(temporaryTitles(sidebar)).toHaveCount(2)

  await background.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url })
    if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { pinned: true })
  }, `${site}/a`)

  await expect(
    sidebar.getByRole("region", { name: "Favorites" }).getByRole("button", { name: "Page /a" }),
  ).toBeVisible()
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /b"])
})

test("clicking a Favorites tile activates the tab", async ({ site, sidebar, background }) => {
  await openPages(background, [`${site}/a`])
  await expect(temporaryTitles(sidebar)).toHaveCount(1)
  await background.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url })
    if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { pinned: true })
  }, `${site}/a`)

  await sidebar
    .getByRole("region", { name: "Favorites" })
    .getByRole("button", { name: "Page /a" })
    .click()

  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a pinned active"])
})

test.fixme("reordering Favorites tiles reorders Chrome's pinned tabs", () => {})
test.fixme("Favorites stay visible whichever Space is shown", () => {})
test.fixme("moving a Favorite to another window makes it a temporary tab of the Space shown there", () => {})
