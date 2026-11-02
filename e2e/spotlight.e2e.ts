import type { BrowserContext, Page, Worker } from "@playwright/test"
import { expect, test } from "./fixtures"
import { openPages, pagesInBrowser, pinnedBookmarks, temporaryTitles } from "./sidebar-actions"

/**
 * `url` のタブをアクティブにしてから、サイドバーの検索ボタンで Spotlight を開く。
 * タブは読み込みを終えていること（サイドバーにページの名前が出ていること）。
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

test("開いているタブの名前を入れて選ぶと、そのタブがアクティブになり、Spotlight が閉じる", async ({
  site,
  context,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`, `${site}/b`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /b", "Page /a"])
  const spotlight = await openSpotlightOver(context, sidebar, background, `${site}/a`)

  await choose(spotlight, "Page /b", /^Page \/b/)

  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a", "/b active"])
  await expect.poll(() => spotlight.isClosed()).toBe(true)
})

test("Pin Tab を選ぶと、アクティブなタブがピンになる", async ({
  site,
  context,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /a"])
  const spotlight = await openSpotlightOver(context, sidebar, background, `${site}/a`)

  await choose(spotlight, "Pin Tab", /^Pin Tab\s+Command/)

  await expect.poll(() => pinnedBookmarks(background)).toStrictEqual(["Page /a"])
})

test("Duplicate Tab を選ぶと、アクティブなタブのすぐ右に複製が開き、同じ Space の一時タブになる", async ({
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

test("URL を入れて Enter を押すと、見ている Space の一時タブとして開く", async ({
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

test.fixme("ピンの名前を入れて選ぶと、閉じたピンならそのピンのタブとして開く", () => {})
test.fixme("Space の名前を入れて選ぶと、その Space に切り替わる", () => {})
test.fixme("ブックマークを選ぶと、見ている Space の一時タブとして開く", () => {})
test.fixme("閲覧履歴を探す設定を有効にすると、閲覧履歴も候補に出る", () => {})
test.fixme("> で始めるとコマンドだけを探す", () => {})
test.fixme("Ctrl+N / Ctrl+P で候補を上下に選べる", () => {})
test.fixme("Escape を押すと、何もせずに閉じる", () => {})
