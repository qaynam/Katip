import type { Page, Worker } from "@playwright/test"
import { expect, test } from "./fixtures"
import { chooseFromMenu, openPages, pagesInBrowser, temporaryTitles } from "./sidebar-actions"

const spaceFolderTitles = (background: Worker) =>
  background.evaluate(async () => {
    const [root] = await chrome.bookmarks.search({ title: "Katip" })
    return root === undefined
      ? []
      : (await chrome.bookmarks.getChildren(root.id)).map((node) => node.title)
  })

/** 下のバーから Space を作り、続けて開く名前の入力に `name` を入れる。テーマの選択は閉じる */
const createSpace = async (sidebar: Page, name: string) => {
  await sidebar.getByRole("button", { name: "Create Space" }).click()
  await sidebar.getByRole("textbox", { name: "Space name" }).fill(name)
  await sidebar.keyboard.press("Enter")
  await sidebar.keyboard.press("Escape")
  await expect(sidebar.getByRole("heading", { name })).toBeVisible()
}

test.beforeEach(async ({ sidebar }) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
})

test("Space を作ると、付けた名前のブックマークのフォルダができ、その Space に新しいタブが開く", async ({
  sidebar,
  background,
}) => {
  await createSpace(sidebar, "Work")

  await expect(
    sidebar
      .getByRole("region", { name: "Temporary tabs" })
      .getByRole("button", { name: "New Tab" }),
  ).toHaveCount(2)
  await expect.poll(() => spaceFolderTitles(background)).toStrictEqual(["Home", "Work"])
})

test("下のバーで Space を切り替えると、その Space で最後に見ていたタブが前面に出る", async ({
  site,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`])
  await sidebar
    .getByRole("region", { name: "Temporary tabs" })
    .getByRole("button", { name: "Page /a" })
    .click()
  await createSpace(sidebar, "Work")
  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a"])

  await sidebar
    .getByRole("navigation", { name: "Switch Space" })
    .getByRole("button", { name: "Home" })
    .click()

  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a active"])
})

test("タブのメニューで別の Space へ移すと、その Space に切り替わり、タブがその Space の一時タブになる", async ({
  site,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`, `${site}/b`])
  await createSpace(sidebar, "Work")
  await sidebar
    .getByRole("navigation", { name: "Switch Space" })
    .getByRole("button", { name: "Home" })
    .click()
  const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })

  await chooseFromMenu(
    sidebar,
    temporary.getByRole("button", { name: "Page /a" }),
    "Move to Space",
    "Work",
  )

  await expect(sidebar.getByRole("heading", { name: "Work" })).toBeVisible()
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /a"])
  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a active", "/b"])
})

test("Space の名前を変えると、ブックマークのフォルダの名前も変わる", async ({
  sidebar,
  background,
}) => {
  await sidebar.getByRole("heading", { name: "Home" }).getByRole("button").dblclick()
  await sidebar.getByRole("textbox", { name: "Space name" }).fill("Personal")
  await sidebar.keyboard.press("Enter")

  await expect(sidebar.getByRole("heading", { name: "Personal" })).toBeVisible()
  await expect.poll(() => spaceFolderTitles(background)).toStrictEqual(["Personal"])
})

test("Space を削除すると、その Space の一時タブは閉じずに残る Space へ移り、フォルダは消える", async ({
  site,
  sidebar,
  background,
}) => {
  await createSpace(sidebar, "Work")
  await openPages(background, [`${site}/w`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /w"])

  await sidebar.getByRole("button", { name: "Space menu" }).click()
  await sidebar.getByRole("menuitem", { name: "Delete Space" }).click()
  await sidebar.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click()

  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /w"])
  await expect.poll(() => spaceFolderTitles(background)).toStrictEqual(["Home"])
})

test("Space のメニューで Open Settings を選ぶと、設定画面がタブで開く", async ({
  context,
  sidebar,
}) => {
  const opened = context.waitForEvent("page", (page) => page.url().includes("/options/"))

  await sidebar.getByRole("button", { name: "Space menu" }).click()
  await sidebar.getByRole("menuitem", { name: "Open Settings" }).click()

  await expect((await opened).getByRole("heading").first()).toBeVisible()
})

test("最後の Space は削除できない", async ({ sidebar }) => {
  await sidebar.getByRole("button", { name: "Space menu" }).click()

  await expect(sidebar.getByRole("menuitem", { name: "Delete Space" })).toBeDisabled()
})

test.fixme("Space のメニューで Edit Theme を選び色を変えると、サイドバーの背景がその色になる", () => {})
test.fixme("下のバーで Space の印をドラッグすると、Space の並びが変わる", () => {})
test.fixme("サイドバーを左右にスワイプすると、隣の Space に切り替わる", () => {})
test.fixme("別の Space の Space フォルダのブックマークを消すと、その Space がなくなる", () => {})
