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
 * `url` のタブをアクティブにしてから、そのタブでショートカットを押したときと同じ引数で
 * `chrome.commands.onCommand` を発火する。
 */
const pressShortcutOn = (background: Worker, url: string, command: string) =>
  // headless の Chrome ではキーを押しても拡張のショートカットが届かないので、Chrome が
  // リスナーに渡すのと同じ引数で、登録済みのリスナーを直接呼ぶ
  background.evaluate(
    async ({ url, command }) => {
      const [target] = await chrome.tabs.query({ url })
      if (target?.id === undefined) throw new Error(`タブが開いていない: ${url}`)
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

test("一時タブで quick-pin-toggle を押すと、そのタブがピン留めの末尾にピンとして並ぶ", async ({
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

test("ピンのタブで quick-pin-toggle を押すと、ピン留めが外れて一時タブに戻る", async ({
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

test("分割ビューのタブで quick-pin-toggle を押すと、2 つを入れた分割ピンになる", async ({
  site,
  sidebar,
  background,
}) => {
  test.skip(!(await isSplitViewAvailable(background)), "分割ビューの API が無い Chrome（154 以前）")
  await openPages(background, [`${site}/a`, `${site}/b`])
  await background.evaluate(async (site) => {
    const ids = (await chrome.tabs.query({}))
      .filter((tab) => (tab.pendingUrl ?? tab.url ?? "").startsWith(site))
      .flatMap((tab) => (tab.id === undefined ? [] : [tab.id]))
    const [left, right] = ids
    if (left === undefined || right === undefined) throw new Error("分割するタブが無い")
    await chrome.tabs.createSplit([left, right])
  }, site)
  await expect(sidebar.getByRole("group", { name: "Page /a" })).toBeVisible()

  await pressShortcutOn(background, `${site}/b`, "quick-pin-toggle")

  await expect
    .poll(() => pinnedBookmarks(background))
    .toStrictEqual(["Page /a | Page /b[Page /a Page /b]"])
})

test("next-tab-in-space を押すと、表示の順で次のタブがアクティブになり、末尾からは先頭へ戻る", async ({
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

test("previous-tab-in-space を押すと、表示の順で前のタブがアクティブになる", async ({
  site,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`, `${site}/b`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /b", "Page /a"])

  await pressShortcutOn(background, `${site}/a`, "previous-tab-in-space")

  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a", "/b active"])
})

test("open-spotlight を押すと、Spotlight が別の小さなウィンドウで開く", async ({
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

test.fixme("copy-current-url を押すと、アクティブなタブの URL がコピーされ、ページの上に知らせが出る", () => {})
test.fixme("copy-current-url-as-markdown を押すと、[タイトル](URL) の形でコピーされる", () => {})
test.fixme("_execute_action（Alt+S）を押すと、サイドパネルが開く", () => {})
