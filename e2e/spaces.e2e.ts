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

/** Creates a Space from the bottom bar, enters `name` in the name editor that opens, and closes the theme picker. */
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

test("creating a Space adds a bookmark folder with the entered name and opens a new tab in it", async ({
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

test("switching Spaces in the bottom bar brings that Space's last viewed tab to the front", async ({
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

test("moving a tab to another Space from its menu switches to that Space with the tab as a temporary tab", async ({
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

test("renaming a Space renames its bookmark folder", async ({ sidebar, background }) => {
  await sidebar.getByRole("heading", { name: "Home" }).getByRole("button").dblclick()
  await sidebar.getByRole("textbox", { name: "Space name" }).fill("Personal")
  await sidebar.keyboard.press("Enter")

  await expect(sidebar.getByRole("heading", { name: "Personal" })).toBeVisible()
  await expect.poll(() => spaceFolderTitles(background)).toStrictEqual(["Personal"])
})

test("deleting a Space moves its temporary tabs to a remaining Space without closing them and removes the folder", async ({
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

test("Open Settings in the Space menu opens the settings page in a tab", async ({
  context,
  sidebar,
}) => {
  const opened = context.waitForEvent("page", (page) => page.url().includes("/options/"))

  await sidebar.getByRole("button", { name: "Space menu" }).click()
  await sidebar.getByRole("menuitem", { name: "Open Settings" }).click()

  await expect((await opened).getByRole("heading").first()).toBeVisible()
})

test("the last Space cannot be deleted", async ({ sidebar }) => {
  await sidebar.getByRole("button", { name: "Space menu" }).click()

  await expect(sidebar.getByRole("menuitem", { name: "Delete Space" })).toBeDisabled()
})

test.fixme("changing the color with Edit Theme in the Space menu recolors the sidebar background", () => {})
test.fixme("dragging a Space mark in the bottom bar reorders the Spaces", () => {})
test.fixme("swiping the sidebar sideways switches to the neighboring Space", () => {})
test.fixme("deleting a Space folder's bookmark removes that Space", () => {})
