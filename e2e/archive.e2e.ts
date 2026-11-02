import { expect, test } from "./fixtures"
import { chooseFromMenu, openPages, pagesInBrowser, temporaryTitles } from "./sidebar-actions"

test.beforeEach(async ({ sidebar }) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
})

test("タブのメニューで Archive を選ぶと、タブが閉じてアーカイブに並ぶ", async ({
  site,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`, `${site}/b`])
  const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })

  await chooseFromMenu(sidebar, temporary.getByRole("button", { name: "Page /a" }), "Archive")
  await sidebar.getByRole("button", { name: "Archive", exact: true }).click()

  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/b"])
  await expect(
    sidebar.getByRole("region", { name: "Archive" }).getByRole("button", { name: /Page \/a/ }),
  ).toBeVisible()
})

test("アーカイブの項目を押すと、元の Space の一時タブとして開き直し、アーカイブから消える", async ({
  site,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`])
  await chooseFromMenu(
    sidebar,
    sidebar
      .getByRole("region", { name: "Temporary tabs" })
      .getByRole("button", { name: "Page /a" }),
    "Archive",
  )
  await sidebar.getByRole("button", { name: "Archive", exact: true }).click()
  const archive = sidebar.getByRole("region", { name: "Archive" })

  await archive.getByRole("button", { name: /Page \/a/ }).click()

  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual(["/a active"])
  await expect(archive.getByText("No archived tabs")).toBeVisible()
  await sidebar.getByRole("button", { name: "Archive", exact: true }).click()
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /a"])
})

test("アーカイブから削除すると、開き直さずに一覧から消える", async ({
  site,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`])
  await chooseFromMenu(
    sidebar,
    sidebar
      .getByRole("region", { name: "Temporary tabs" })
      .getByRole("button", { name: "Page /a" }),
    "Archive",
  )
  await sidebar.getByRole("button", { name: "Archive", exact: true }).click()
  const archive = sidebar.getByRole("region", { name: "Archive" })

  await archive.getByRole("button", { name: "Remove from Archive" }).click()

  await expect(archive.getByText("No archived tabs")).toBeVisible()
  await expect.poll(() => pagesInBrowser(background, site)).toStrictEqual([])
})

test.fixme("自動アーカイブを入れると、選んだ時間より長く使っていない一時タブがアーカイブされて閉じる", () => {})
test.fixme("自動アーカイブは、ピンや Favorites や音の出ているタブを閉じない", () => {})
test.fixme("アーカイブの表示を All Spaces にすると、ほかの Space のアーカイブも Space の名前つきで出る", () => {})
