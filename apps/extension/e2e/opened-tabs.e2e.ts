import type { BrowserContext, Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { openPages, seedPins, temporaryTitles } from "./sidebar-actions"

const pageAt = async (context: BrowserContext, path: string) => {
  await expect.poll(() => context.pages().some((page) => page.url().includes(path))).toBe(true)
  return context.pages().find((page) => page.url().includes(path)) as Page
}

const clickLink = async (page: Page, path: string) => {
  await page.bringToFront()
  await page.getByRole("link", { name: path }).click()
}

test.beforeEach(async ({ sidebar }) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
})

test("links opened from a temporary tab show right below it, the latest first", async ({
  site,
  context,
  sidebar,
  background,
}) => {
  await openPages(background, [`${site}/a`, `${site}/b?links=/x,/y`, `${site}/c`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /c", "Page /b", "Page /a"])
  const opener = await pageAt(context, "/b?links")

  await clickLink(opener, "/x")
  await expect(temporaryTitles(sidebar)).toHaveCount(4)
  await clickLink(opener, "/y")

  await expect(temporaryTitles(sidebar)).toHaveText([
    "Page /c",
    "Page /b",
    "Page /y",
    "Page /x",
    "Page /a",
  ])
})

test("a link opened from a pin shows at the top of the temporary tabs", async ({
  site,
  context,
  sidebar,
  background,
}) => {
  await seedPins(background, [{ title: "Docs", url: `${site}/docs?links=/x` }])
  await openPages(background, [`${site}/a`, `${site}/b`])
  await expect(temporaryTitles(sidebar)).toHaveText(["Page /b", "Page /a"])
  await sidebar
    .getByRole("region", { name: "Pinned" })
    .getByRole("button", { name: "Docs" })
    .click()
  const pin = await pageAt(context, "/docs")

  await clickLink(pin, "/x")

  await expect(temporaryTitles(sidebar)).toHaveText(["Page /x", "Page /b", "Page /a"])
})
