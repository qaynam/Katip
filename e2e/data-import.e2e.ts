import { fileURLToPath } from "node:url"
import { expect, test } from "./fixtures"
import { pinnedBookmarks } from "./sidebar-actions"

const ARC_SIDEBAR_FIXTURE = fileURLToPath(
  new URL("../src/modules/arc-import/fixtures/arc-sidebar.json", import.meta.url),
)

test("importing Arc's sidebar file from the settings page adds its Spaces, pins and Favorites after a preview", async ({
  context,
  sidebar,
  background,
}) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
  // The fixture's pages are made up; answer them here so opening the Favorites reaches no network
  await context.route(
    (url) => url.hostname.endsWith(".example.com"),
    (route) => route.fulfill({ contentType: "text/html", body: "<title>Example</title>" }),
  )
  const options = await context.newPage()
  await options.goto(new URL("options/index.html", background.url()).href)
  await options.getByRole("tab", { name: "Data" }).click()

  const choosing = options.waitForEvent("filechooser")
  await options.getByRole("button", { name: "Choose File…" }).first().click()
  await (await choosing).setFiles(ARC_SIDEBAR_FIXTURE)
  const preview = options.getByRole("region", { name: "Ready to import from Arc" })
  await expect(preview.getByRole("list", { name: "To be added" }).getByRole("listitem")).toHaveText(
    ["4 Spaces", "9 pinned tabs", "3 folders", "2 split views", "3 Favorites"],
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
  await expect
    .poll(() =>
      background.evaluate(async () =>
        (await chrome.tabs.query({ pinned: true })).map((tab) => tab.pendingUrl ?? tab.url),
      ),
    )
    .toStrictEqual([
      "https://calendar.example.com/",
      "https://music.example.com/",
      "https://photos.example.com/",
    ])
  const switcher = sidebar.getByRole("navigation", { name: "Switch Space" })
  for (const name of ["Home", "Work", "Reading", "Space 4", "Personal"]) {
    await expect(switcher.getByRole("button", { name, exact: true })).toBeVisible()
  }
})
