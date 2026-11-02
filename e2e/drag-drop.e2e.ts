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

test.describe("一時タブをドラッグしたとき", () => {
  test("ピン留めの領域へ落とすと、ピンになり、Space のフォルダにブックマークができる", async ({
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

  test("フォルダの中ほどへ落とすと、フォルダの中のピンになる", async ({
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

  test("Favorites へ落とすと、Chrome でピン留めされ、一時タブから消える", async ({
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

  test("別の一時タブの上寄りへ落とすと、表示ではそのタブの上に並ぶ", async ({
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
    // 新しいタブを上に出す設定（既定）では、表示の上ほど Chrome のタブの右にある
    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/b", "/c", "/a"])
  })
})

test.describe("ピンをドラッグしたとき", () => {
  test("開いているピンを一時タブの上へ落とすと、ピン留めが外れて一時タブに戻り、ブックマークが消える", async ({
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

  test("ピンの上寄りへ落とすと、そのピンの前に並び、ブックマークの順も変わる", async ({
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

test.describe("Favorites のタブをドラッグしたとき", () => {
  test("一時タブの上へ落とすと、Chrome のピン留めが外れて一時タブに戻る", async ({
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
  })

  test("ピン留めの領域へ落とすと、Chrome のピン留めが外れてピンになる", async ({
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
  })
})

test.fixme("分割ピンをフォルダの中ほどへ落とすと、分割ピンのままフォルダに入る", () => {})
test.fixme("フォルダを別の Space のフォルダへ移すと、中で開いているピンのタブもその Space に移る", () => {})
test.fixme("タブグループと同期している間は、フォルダを 2 段目より深くへは落とせない", () => {})
test.fixme("ドラッグ中に Escape を押すと、何も変えずにやめる", () => {})
