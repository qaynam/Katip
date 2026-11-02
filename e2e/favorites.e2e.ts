import { expect, test } from "./fixtures"
import { openPages, pagesInBrowser, temporaryTitles } from "./sidebar-actions"

test.beforeEach(async ({ sidebar }) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
})

test("Chrome でピン留めしたタブは、一時タブではなく Favorites に出る", async ({
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

test("Favorites のタイルを押すと、そのタブがアクティブになる", async ({
  site,
  sidebar,
  background,
}) => {
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

test.fixme("Favorites のタイルを並べ替えると、Chrome のピン留めしたタブの順も変わる", () => {})
test.fixme("Favorites のタブは、どの Space に切り替えても表示される", () => {})
test.fixme("Favorites のタブを別のウィンドウへ移すと、移った先のウィンドウで見ている Space の一時タブになる", () => {})
