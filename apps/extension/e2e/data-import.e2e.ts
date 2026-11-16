import type { BrowserContext, Worker } from "@playwright/test"
import { fileURLToPath } from "node:url"
import { expect, test } from "./fixtures"
import { pinnedBookmarks } from "./sidebar-actions"

const ARC_SIDEBAR_FIXTURE = fileURLToPath(
  new URL("../src/modules/arc-import/fixtures/arc-sidebar.json", import.meta.url),
)

/** Chooses Arc's sidebar file on the settings page and waits for its preview. */
const previewArcFile = async (context: BrowserContext, background: Worker) => {
  const options = await context.newPage()
  await options.goto(new URL("options/index.html", background.url()).href)
  await options.getByRole("tab", { name: "Data" }).click()
  const choosing = options.waitForEvent("filechooser")
  await options.getByRole("button", { name: "Choose File…" }).first().click()
  await (await choosing).setFiles(ARC_SIDEBAR_FIXTURE)
  return {
    options,
    preview: options.getByRole("region", { name: "Ready to import from Arc" }),
  }
}

test("importing Arc's sidebar file from the settings page adds its Spaces, pins and each Space's Favorites after a preview", async ({
  context,
  sidebar,
  background,
}) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
  const { options, preview } = await previewArcFile(context, background)

  await expect(preview.getByRole("list", { name: "To be added" }).getByRole("listitem")).toHaveText(
    ["4 Spaces", "9 pinned tabs", "3 folders", "2 split views", "8 Favorites"],
  )
  expect(await pinnedBookmarks(background, "Work")).toBeNull()

  await preview.getByRole("button", { name: "Import" }).click()

  await expect(options.getByRole("status")).toHaveText("Imported")
  expect({
    home: await pinnedBookmarks(background, "Home"),
    work: await pinnedBookmarks(background, "Work"),
    reading: await pinnedBookmarks(background, "Reading"),
    untitled: await pinnedBookmarks(background, "Space 4"),
    personal: await pinnedBookmarks(background, "Personal"),
  }).toStrictEqual({
    home: [],
    work: [
      "Inbox",
      "Projects[Roadmap – Docs Archive[2025 Review] Board | Team Chat[Board Team Chat]]",
      "Design | Spec[Design Spec]",
      "Prototype",
      "status.example.com",
    ],
    reading: ["Long Read"],
    untitled: ["Weather"],
    personal: ["Recipes", "Trips[Packing List]"],
  })
  const switcher = sidebar.getByRole("navigation", { name: "Switch Space" })
  for (const name of ["Home", "Work", "Reading", "Space 4", "Personal"]) {
    await expect(switcher.getByRole("button", { name, exact: true })).toBeVisible()
  }
  const favorites = sidebar.getByRole("region", { name: "Favorites" })
  await expect(favorites.getByText("Drag tabs here to add them to Favorites")).toBeVisible()
  await switcher.getByRole("button", { name: "Personal", exact: true }).click()
  await expect(sidebar.getByRole("heading", { name: "Personal" })).toBeVisible()
  // Added closed, so no tab opens for them
  await expect(favorites.getByRole("button")).toHaveCount(2)
  expect(
    await Promise.all(
      (await favorites.getByRole("button").all()).map(async (tile) => [
        await tile.getAttribute("aria-label"),
        await tile.getAttribute("data-favorite-state"),
      ]),
    ),
  ).toStrictEqual([
    ["Photos", "closed"],
    ["Calendar", "closed"],
  ])
  expect(await background.evaluate(async () => chrome.tabs.query({ pinned: true }))).toStrictEqual(
    [],
  )
})

test("combining the chosen Arc Spaces adds one Space named Arc with a folder for each, and leaves the existing Space as it was", async ({
  context,
  sidebar,
  background,
}) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
  const { options, preview } = await previewArcFile(context, background)

  await preview.getByRole("checkbox", { name: "Untitled Space" }).click()
  await preview.getByRole("radio", { name: "Combine into one Space" }).click()
  await preview.getByRole("switch", { name: "Add to Favorites" }).click()

  await expect(preview.getByRole("list", { name: "To be added" }).getByRole("listitem")).toHaveText(
    ["1 Space", "8 pinned tabs", "5 folders", "2 split views"],
  )
  await expect(
    preview.getByRole("list", { name: "Changed to fit Katip" }).getByRole("listitem").first(),
  ).toHaveText(
    "2 folders are nested deeper than Katip allows, so their contents go into the folder above them.",
  )

  await preview.getByRole("button", { name: "Import" }).click()

  await expect(options.getByRole("status")).toHaveText("Imported")
  expect({
    home: await pinnedBookmarks(background, "Home"),
    arc: await pinnedBookmarks(background, "Arc"),
    work: await pinnedBookmarks(background, "Work"),
  }).toStrictEqual({
    home: [],
    arc: [
      "Work[Inbox Projects[Roadmap – Docs 2025 Review Board | Team Chat[Board Team Chat]] Design | Spec[Design Spec] Prototype status.example.com]",
      "Reading[Long Read]",
      "Personal[Recipes Trips[Packing List]]",
    ],
    work: null,
  })
  const switcher = sidebar.getByRole("navigation", { name: "Switch Space" })
  await expect(switcher.getByRole("button")).toHaveCount(2)
  for (const name of ["Home", "Arc"]) {
    await expect(switcher.getByRole("button", { name, exact: true })).toBeVisible()
  }
})
