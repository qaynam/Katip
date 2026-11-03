import type { BrowserContext, Page, Worker } from "@playwright/test"
import { expect, test } from "./fixtures"
import { isSplitViewAvailable } from "./sidebar-actions"

/** The label the Shortcuts category shows for each command the manifest declares. */
const COMMAND_LABELS: Readonly<Record<string, string>> = {
  _execute_action: "Open the side panel",
  "open-spotlight": "Open Spotlight",
  "next-tab-in-space": "Next tab in the Space",
  "previous-tab-in-space": "Previous tab in the Space",
  "quick-pin-toggle": "Pin or unpin the tab",
  "copy-current-url": "Copy URL",
  "copy-current-url-as-markdown": "Copy URL as a Markdown link",
}

const openSettings = async (context: BrowserContext, background: Worker, category: string) => {
  const page = await context.newPage()
  await page.goto(new URL("options/index.html", background.url()).href)
  await page.getByRole("tab", { name: category }).click()
  return page
}

/** The keys shown beside `command`. */
// Not by role and name: ARIA forbids naming terms and definitions, so the command's text locates
// its term and the definition that follows it
const keysShownFor = (settings: Page, command: string) =>
  settings
    .getByRole("term")
    .filter({ hasText: new RegExp(`^${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
    .locator("xpath=following-sibling::dd[1]")

test.fixme("switching the language to Japanese shows the sidebar and Spotlight in Japanese", () => {})
test.fixme("the automatic language follows the browser's language", () => {})
test.fixme("with new tabs at the top turned off, temporary tabs list oldest first", () => {})
test.fixme("showing all open tabs in collapsed folders lists every open tab below a collapsed folder", () => {})
test.fixme("syncing with tab groups makes a tab group per Space and collapses the groups of Spaces not shown", () => {})
test.fixme("turning tab group sync off leaves the existing tab groups as they are", () => {})
test.fixme("while syncing with tab groups, a folder cannot be created inside a folder", () => {})

test("split view shows as available exactly when the browser has the split view API", async ({
  context,
  background,
}) => {
  const hasSplitView = await isSplitViewAvailable(background)

  const settings = await openSettings(context, background, "Tabs")

  await expect(
    settings.getByText(
      hasSplitView ? "Available" : "Not available in this browser (requires Chrome 155 or later)",
      { exact: true },
    ),
  ).toBeVisible()
})

test.fixme("the auto archive time chosen in settings shows in the sidebar's archive settings", () => {})

test("the Shortcuts category lists every command with the key the browser assigned, or Not set", async ({
  context,
  background,
}) => {
  const commands = await background.evaluate(() => chrome.commands.getAll())

  const settings = await openSettings(context, background, "Shortcuts")

  expect(commands.map(({ name }) => name).sort()).toStrictEqual(Object.keys(COMMAND_LABELS).sort())
  for (const { name, shortcut } of commands) {
    await expect(keysShownFor(settings, COMMAND_LABELS[name ?? ""] ?? "")).toHaveText(
      shortcut === undefined || shortcut === "" ? "Not set" : shortcut,
    )
  }
})

test("opening the keyboard shortcut settings opens Chrome's shortcuts page", async ({
  context,
  background,
}) => {
  const settings = await openSettings(context, background, "Shortcuts")

  await settings.getByRole("button", { name: "Edit in Chrome" }).click()

  await expect
    .poll(() =>
      background.evaluate(async () =>
        (await chrome.tabs.query({})).map((tab) => tab.pendingUrl ?? tab.url),
      ),
    )
    .toContain("chrome://extensions/shortcuts")
})

test("turning on a copy shortcut keeps it on across reloads, without access to all sites", async ({
  context,
  background,
}) => {
  const settings = await openSettings(context, background, "Shortcuts")

  await settings.getByRole("switch", { name: "Copy URL", exact: true }).check()
  await expect(settings.getByText("Saved")).toBeVisible()
  await settings.reload()

  await expect(settings.getByRole("switch", { name: "Copy URL", exact: true })).toBeChecked()
  expect(
    await background.evaluate(() => chrome.permissions.contains({ origins: ["*://*/*"] })),
  ).toBe(false)
})

test.fixme("enabling history search asks for the history permission and, once granted, shows history in Spotlight", () => {})

test("the settings page shows the extension version", async ({ context, background }) => {
  const version = await background.evaluate(() => chrome.runtime.getManifest().version)

  const settings = await openSettings(context, background, "General")

  await expect(settings.getByText(version, { exact: true })).toBeVisible()
})
