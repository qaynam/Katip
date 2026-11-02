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

/** `paths` のページを開き、続けて開いた 2 つを本物の分割ビューにする */
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
      if (left === undefined || right === undefined) throw new Error("分割するタブが無い")
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

test.describe("分割ビューの API がある Chrome", () => {
  test.beforeEach(async ({ sidebar, background }) => {
    test.skip(
      !(await isSplitViewAvailable(background)),
      "分割ビューの API が無い Chrome（154 以前）",
    )
    await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
  })

  test("一時タブを別の一時タブに重ねると、ブラウザの画面が分割され、重ねたタブが前に出る", async ({
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

  test("分割ビューの行は、2 つのタブを 1 行に並べて表す", async ({ site, sidebar, background }) => {
    await openSplit(background, site, ["/a", "/b"])

    await expect(splitRowOf(sidebar, "Page /a").getByRole("group")).toHaveText([
      "Page /a",
      "Page /b",
    ])
  })

  test("分割ビューの行のメニューで Separate Tabs を選ぶと、2 つの単独のタブに戻る", async ({
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

  test("分割ビューの行のメニューで Pin を選ぶと、2 つを入れたフォルダの分割ピンになる", async ({
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

  test("分割ビューの行をピン留めの領域へ落とすと、分割ピンになる", async ({
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

  test("閉じた分割ピンを開くと、2 つのタブが分割ビューで並んで開く", async ({
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

  test("開いている分割ピンを一時タブの上へ落とすと、分割ビューのまま一時タブに戻り、分割ピンは消える", async ({
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

  test("分割ビューの行を一時タブの別の位置へ落としても、分割ビューのまま並ぶ", async ({
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

test.describe("分割ビューの API が無い Chrome", () => {
  test.beforeEach(async ({ sidebar, background }) => {
    test.skip(await isSplitViewAvailable(background), "分割ビューの API がある Chrome（155 以降）")
    await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
  })

  test("一時タブを別の一時タブに重ねても分割されず、対応していないことが知らされる", async ({
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
