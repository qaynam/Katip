import type { BrowserContext, Page } from "@playwright/test"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { closeOnboarding, extensionWorkerOf, launchInProfile } from "./browser-launch"
import { EXTENSION_DIR } from "./extension-dir"
import { expect, test } from "./fixtures"
import { openPages, temporaryTitles } from "./sidebar-actions"

const openSidebarIn = async (context: BrowserContext) => {
  const background = await extensionWorkerOf(context)
  const extensionId = new URL(background.url()).host
  const sidebar = context.pages()[0] ?? (await context.newPage())
  await sidebar.goto(`chrome-extension://${extensionId}/sidepanel/index.html`)
  return { background, extensionId, sidebar }
}

const favoriteTile = (sidebar: Page) =>
  sidebar.getByRole("region", { name: "Favorites" }).getByRole("button", { name: "Page /a" })

// A closed Favorite is kept only in the extension's storage. An open one could come back from a
// pinned tab Chrome restores, even if that storage had been lost
test("an update unzipped into another folder is the same extension, keeping its closed Favorites", async ({
  site,
}) => {
  const profile = await mkdtemp(join(tmpdir(), "katip-e2e-"))
  const updateDir = await mkdtemp(join(tmpdir(), "katip-e2e-update-"))
  await cp(EXTENSION_DIR, updateDir, { recursive: true })
  try {
    const installed = await launchInProfile(profile, EXTENSION_DIR)
    await closeOnboarding(installed)
    const before = await openSidebarIn(installed)
    await openPages(before.background, [`${site}/a`, `${site}/b`])
    await expect(temporaryTitles(before.sidebar)).toHaveCount(2)
    await before.background.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url })
      if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { pinned: true })
    }, `${site}/a`)
    await expect(favoriteTile(before.sidebar)).toBeVisible()
    await before.background.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url })
      if (tab?.id !== undefined) await chrome.tabs.remove(tab.id)
    }, `${site}/a`)
    await expect(favoriteTile(before.sidebar)).toHaveAttribute("data-favorite-state", "closed")
    await installed.close()

    const updated = await launchInProfile(profile, updateDir)
    const after = await openSidebarIn(updated)

    expect(after.extensionId).toBe(before.extensionId)
    await expect(favoriteTile(after.sidebar)).toHaveAttribute("data-favorite-state", "closed")
    await updated.close()
  } finally {
    await rm(profile, { recursive: true, force: true })
    await rm(updateDir, { recursive: true, force: true })
  }
})
