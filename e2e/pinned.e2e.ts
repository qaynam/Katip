import { dragOnto, renameRow, seedPins } from "./sidebar-actions"
import { expect, test } from "./fixtures"

test.beforeEach(async ({ sidebar }) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
})

test("ピンをクリックすると、そのページがタブで開く", async ({ site, sidebar, background }) => {
  await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
  const pinned = sidebar.getByRole("region", { name: "Pinned" })

  await pinned.getByRole("button", { name: "Docs" }).click()

  await expect
    .poll(() =>
      background.evaluate(async () => (await chrome.tabs.query({})).map((tab) => tab.url)),
    )
    .toContain(`${site}/docs`)
})

test("フォルダに入れたタブを外へ出すと、開き直さなくてもフォルダの外に出る", async ({
  site,
  sidebar,
  background,
}) => {
  await seedPins(background, [{ title: "Outer" }, { title: "After", url: `${site}/after` }])
  await background.evaluate((url) => chrome.tabs.create({ url, active: false }), `${site}/a`)
  const pinned = sidebar.getByRole("region", { name: "Pinned" })
  const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })
  await dragOnto(
    temporary.getByRole("button", { name: "Page /a" }),
    pinned.getByRole("button", { name: "Outer" }),
    0.5,
  )
  await pinned.getByRole("button", { name: "Outer" }).click()
  const insideOuter = pinned
    .getByRole("listitem")
    .filter({ has: sidebar.getByRole("button", { name: "Outer" }) })
  await expect(insideOuter.getByRole("button", { name: "Page /a" })).toBeVisible()

  await dragOnto(
    insideOuter.getByRole("button", { name: "Page /a" }),
    pinned.getByRole("button", { name: "After" }),
    0.9,
  )

  await expect(insideOuter.getByRole("button", { name: "Page /a" })).toHaveCount(0)
  await expect(pinned.getByRole("button", { name: "Page /a" })).toBeVisible()
})

test("フォルダに入れたフォルダを外へ出すと、開き直さなくてもフォルダの外に出る", async ({
  sidebar,
  background,
}) => {
  await seedPins(background, [{ title: "Outer" }, { title: "Inner" }])
  const pinned = sidebar.getByRole("region", { name: "Pinned" })
  await dragOnto(
    pinned.getByRole("button", { name: "Inner" }),
    pinned.getByRole("button", { name: "Outer" }),
    0.5,
  )
  await pinned.getByRole("button", { name: "Outer" }).click()
  const insideOuter = pinned
    .getByRole("listitem")
    .filter({ has: sidebar.getByRole("button", { name: "Outer" }) })
  await expect(insideOuter.getByRole("button", { name: "Inner" })).toBeVisible()

  await dragOnto(
    insideOuter.getByRole("button", { name: "Inner" }),
    pinned.getByRole("button", { name: "Outer" }),
    0.1,
  )

  await expect(insideOuter.getByRole("button", { name: "Inner" })).toHaveCount(0)
  await expect(pinned.getByRole("button", { name: "Inner" })).toBeVisible()
})

test("開いているピンの名前を変えると、行の名前が変わる", async ({ site, sidebar, background }) => {
  await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
  const pinned = sidebar.getByRole("region", { name: "Pinned" })
  await pinned.getByRole("button", { name: "Docs" }).click()
  await expect(pinned.getByRole("button", { name: "Close Tab" })).toBeVisible()

  await renameRow(sidebar, pinned.getByRole("button", { name: "Docs" }), "Handbook")

  await expect(pinned.getByRole("button", { name: "Handbook" })).toBeVisible()
})

test("ピンした URL から別のページへ移ったピンも、名前を変えると行の名前が変わる", async ({
  site,
  sidebar,
  background,
}) => {
  await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
  const pinned = sidebar.getByRole("region", { name: "Pinned" })
  await pinned.getByRole("button", { name: "Docs" }).click()
  await expect(pinned.getByRole("button", { name: "Close Tab" })).toBeVisible()
  await background.evaluate(async (site) => {
    const tab = (await chrome.tabs.query({})).find(
      (each) => (each.pendingUrl ?? each.url) === `${site}/docs`,
    )
    if (tab?.id === undefined) throw new Error("ピンのタブが開いていない")
    await chrome.tabs.update(tab.id, { url: `${site}/elsewhere` })
  }, site)
  await expect(pinned.getByRole("button", { name: "Go back to the pinned URL" })).toBeVisible()

  await renameRow(sidebar, pinned.getByRole("button", { name: "Docs" }), "Handbook")

  await expect(pinned.getByRole("button", { name: "Handbook" })).toBeVisible()
})

test("別のピンや一時タブと同じ名前にも変えられる", async ({ site, sidebar, background }) => {
  await seedPins(background, [
    { title: "One", url: `${site}/one` },
    { title: "Two", url: `${site}/two` },
  ])
  await background.evaluate(async (site) => {
    await chrome.tabs.create({ url: `${site}/a`, active: false })
    await chrome.tabs.create({ url: `${site}/b`, active: false })
  }, site)
  const pinned = sidebar.getByRole("region", { name: "Pinned" })
  const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })
  await expect(temporary.getByRole("button", { name: "Page /b" })).toBeVisible()

  await renameRow(sidebar, pinned.getByRole("button", { name: "Two" }), "One")
  await renameRow(sidebar, temporary.getByRole("button", { name: "Page /b" }), "Page /a")

  await expect(pinned.getByRole("button", { name: "One" })).toHaveCount(2)
  await expect(temporary.getByRole("button", { name: "Page /a" })).toHaveCount(2)
})

test.fixme("フォルダを押すと開閉し、サイドパネルを開き直しても開閉の状態が保たれる", () => {})
test.fixme("閉じたフォルダの中の開いているタブは、閉じたフォルダのすぐ下に覗かせる", () => {})
test.fixme("フォルダのメニューで Change Icon を選ぶと、選んだアイコンがフォルダに付く", () => {})
test.fixme("フォルダのメニューで Delete Folder を選んで確かめると、中身ごとブックマークが消える", () => {})
test.fixme("フォルダ内検索で名前を入れると、フォルダの中のピンだけが絞り込まれる", () => {})
test.fixme("フォルダを自分の中のフォルダへは落とせず、理由が知らされる", () => {})
test.fixme("閉じたピンを一時タブの領域へ落としても、何も起きない", () => {})
test.fixme("ピンのブックマークを Chrome のブックマークの画面で変えると、サイドバーのピンも変わる", () => {})
