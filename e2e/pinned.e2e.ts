import { dragOnto, renameRow, seedPins } from "./sidebar-actions"
import { expect, test } from "./fixtures"

test.beforeEach(async ({ sidebar }) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
})

test("clicking a pin opens its page in a tab", async ({ site, sidebar, background }) => {
  await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
  const pinned = sidebar.getByRole("region", { name: "Pinned" })

  await pinned.getByRole("button", { name: "Docs" }).click()

  await expect
    .poll(() =>
      background.evaluate(async () => (await chrome.tabs.query({})).map((tab) => tab.url)),
    )
    .toContain(`${site}/docs`)
})

test("dragging a tab out of a folder shows it outside the folder without reopening the panel", async ({
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

test("dragging a folder out of a folder shows it outside without reopening the panel", async ({
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

test("renaming an open pin renames its row", async ({ site, sidebar, background }) => {
  await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
  const pinned = sidebar.getByRole("region", { name: "Pinned" })
  await pinned.getByRole("button", { name: "Docs" }).click()
  await expect(pinned.getByRole("button", { name: "Close Tab" })).toBeVisible()

  await renameRow(sidebar, pinned.getByRole("button", { name: "Docs" }), "Handbook")

  await expect(pinned.getByRole("button", { name: "Handbook" })).toBeVisible()
})

test("renaming a pin that navigated away from its pinned URL renames its row too", async ({
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
    if (tab?.id === undefined) throw new Error("the pinned tab is not open")
    await chrome.tabs.update(tab.id, { url: `${site}/elsewhere` })
  }, site)
  await expect(pinned.getByRole("button", { name: "Go back to the pinned URL" })).toBeVisible()

  await renameRow(sidebar, pinned.getByRole("button", { name: "Docs" }), "Handbook")

  await expect(pinned.getByRole("button", { name: "Handbook" })).toBeVisible()
})

test("a row can be renamed to the same name as another pin or temporary tab", async ({
  site,
  sidebar,
  background,
}) => {
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

test.fixme("clicking a folder toggles it, and the state survives reopening the side panel", () => {})
test.fixme("open tabs inside a collapsed folder peek out right below it", () => {})
test.fixme("Change Icon in the folder menu puts the chosen icon on the folder", () => {})
test.fixme("confirming Delete Folder in the folder menu deletes the bookmarks with their contents", () => {})
test.fixme("searching inside a folder narrows to the pins in that folder", () => {})
test.fixme("a folder cannot be dropped into its own subfolder, and the reason is shown", () => {})
test.fixme("dropping a closed pin on the temporary tabs does nothing", () => {})
test.fixme("editing a pin's bookmark in Chrome's bookmark manager updates the pin in the sidebar", () => {})
