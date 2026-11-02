import { expect, test } from "./fixtures"
import { chooseFromMenu, openPages, pagesInBrowser, temporaryTitles } from "./sidebar-actions"

test.beforeEach(async ({ sidebar }) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
})

test("Archive in the tab menu closes the tab and lists it in the archive", async ({
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

test("clicking an archive entry reopens it as a temporary tab of its Space and removes it from the archive", async ({
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

test("removing an archive entry deletes it from the list without reopening it", async ({
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

test.fixme("with auto archive on, temporary tabs unused for longer than the chosen time are archived and closed", () => {})
test.fixme("auto archive never closes pins, Favorites or audible tabs", () => {})
test.fixme("showing All Spaces in the archive lists other Spaces' entries with their Space names", () => {})
