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

test.describe("一時タブ", () => {
  test("押すと、そのタブがアクティブになる", async ({ site, sidebar, background }) => {
    await openPages(background, [`${site}/a`, `${site}/b`])

    await sidebar
      .getByRole("region", { name: "Temporary tabs" })
      .getByRole("button", { name: "Page /a" })
      .click()

    await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a active", "/b"])
  })

  test("New Tab を押すと、新しいタブがアクティブになり、見ている Space の一時タブになる", async ({
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

  test("メニューで Pin を選ぶと、ピン留めの末尾にピンとして並ぶ", async ({
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

  test("メニューで Add to Favorites を選ぶと、Chrome でピン留めされて Favorites に並ぶ", async ({
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

  test("閉じるボタンを押すと、そのタブだけが閉じる", async ({ site, sidebar, background }) => {
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

  test("Clear を押すと、その Space の一時タブが閉じ、ピンのタブは残る", async ({
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

test.describe("ピン", () => {
  test("閉じたピンのメニューで Delete Pinned Tab を選んで確かめると、ブックマークが消える", async ({
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

  test("Space のメニューで New Folder を選ぶと、付けた名前のフォルダがピン留めの末尾にできる", async ({
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

  test("開いているピンのメニューで Unpin を選ぶと、一時タブに戻り、ブックマークが消える", async ({
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

  test("開いているピンのタブを閉じても、閉じたピンとして残り、クリックで開き直せる", async ({
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

  test("ピンした URL から移ったピンの戻るボタンを押すと、ピンの URL に戻る", async ({
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

  test("移った先のページで Replace Pinned URL を選ぶと、ピンのブックマークが今の URL になる", async ({
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

test.fixme("タブを中ボタンで押すと、そのタブが閉じる", () => {})
test.fixme("音を出しているタブには音のしるしが、ミュートしたタブにはミュートのしるしが出る", () => {})
test.fixme("一時タブの名前を空にすると、ページのタイトルに戻る", () => {})
test.fixme("読み込み中のタブは、読み込み中のしるしを出す", () => {})
