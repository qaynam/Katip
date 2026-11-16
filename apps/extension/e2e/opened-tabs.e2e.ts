import type { BrowserContext, Page, Worker } from "@playwright/test"
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

/** Starts noting every order the temporary tabs show in, as tab IDs, each time the rows change. */
const watchTemporaryOrder = (sidebar: Page) =>
  sidebar.evaluate(() => {
    const seen: Array<ReadonlyArray<number>> = []
    const note = () => {
      const order = [
        ...document.querySelectorAll<HTMLElement>(
          'section[aria-label="Temporary tabs"] [data-tab-id]',
        ),
      ].map((row) => Number(row.dataset.tabId))
      if (seen.at(-1)?.join() !== order.join()) seen.push(order)
    }
    new MutationObserver(note).observe(document.body, { subtree: true, childList: true })
    note()
    Object.assign(window, { temporaryOrdersSeen: seen })
  })

/** The orders noted since {@link watchTemporaryOrder}, the local site's tabs named by path. */
const temporaryOrdersSeen = async (sidebar: Page, background: Worker, site: string) => {
  const seen = await sidebar.evaluate(
    () =>
      (window as unknown as { temporaryOrdersSeen: ReadonlyArray<ReadonlyArray<number>> })
        .temporaryOrdersSeen,
  )
  const names = new Map(
    await background.evaluate(
      async (site) =>
        (await chrome.tabs.query({})).map((tab): [number, string] => {
          const url = tab.pendingUrl ?? tab.url ?? ""
          return [tab.id ?? -1, url.startsWith(site) ? new URL(url).pathname : url]
        }),
      site,
    ),
  )
  return seen.map((order) => order.map((tabId) => names.get(tabId) ?? `closed tab ${tabId}`))
}

const showNewTabsAtTheBottom = (background: Worker) =>
  background.evaluate(async () => {
    const key = "katip/settings"
    const stored: object = (await chrome.storage.sync.get(key))[key] ?? {}
    await chrome.storage.sync.set({ [key]: { ...stored, newTabsOnTop: false } })
  })

for (const newTabsOnTop of [true, false]) {
  const where = newTabsOnTop ? "new tabs at the top" : "new tabs at the bottom"

  test.describe(`with ${where}, a new tab first shows where it stays`, () => {
    test.beforeEach(async ({ background }) => {
      if (!newTabsOnTop) await showNewTabsAtTheBottom(background)
    })

    test("links opened from a temporary tab", async ({ site, context, sidebar, background }) => {
      await openPages(background, [`${site}/a`, `${site}/b?links=/x,/y`, `${site}/c`])
      await expect(temporaryTitles(sidebar)).toHaveText(
        newTabsOnTop ? ["Page /c", "Page /b", "Page /a"] : ["Page /a", "Page /b", "Page /c"],
      )
      const opener = await pageAt(context, "/b?links")
      await watchTemporaryOrder(sidebar)

      await clickLink(opener, "/x")
      await expect(temporaryTitles(sidebar)).toHaveCount(4)
      await clickLink(opener, "/y")
      await expect(temporaryTitles(sidebar)).toHaveCount(5)

      expect(await temporaryOrdersSeen(sidebar, background, site)).toStrictEqual(
        newTabsOnTop
          ? [
              ["/c", "/b", "/a"],
              ["/c", "/b", "/x", "/a"],
              ["/c", "/b", "/y", "/x", "/a"],
            ]
          : [
              ["/a", "/b", "/c"],
              ["/a", "/b", "/x", "/c"],
              ["/a", "/b", "/y", "/x", "/c"],
            ],
      )
    })

    test("a link opened from a pin", async ({ site, context, sidebar, background }) => {
      await seedPins(background, [{ title: "Docs", url: `${site}/docs?links=/x` }])
      await openPages(background, [`${site}/a`, `${site}/b`])
      await expect(temporaryTitles(sidebar)).toHaveCount(2)
      await sidebar
        .getByRole("region", { name: "Pinned" })
        .getByRole("button", { name: "Docs" })
        .click()
      const pin = await pageAt(context, "/docs")
      await watchTemporaryOrder(sidebar)

      await clickLink(pin, "/x")
      await expect(temporaryTitles(sidebar)).toHaveCount(3)

      expect(await temporaryOrdersSeen(sidebar, background, site)).toStrictEqual(
        newTabsOnTop
          ? [
              ["/b", "/a"],
              ["/x", "/b", "/a"],
            ]
          : [
              ["/a", "/b"],
              ["/x", "/a", "/b"],
            ],
      )
    })

    test("a tab from the New Tab row", async ({ site, sidebar, background }) => {
      await openPages(background, [`${site}/a`, `${site}/b`])
      await expect(temporaryTitles(sidebar)).toHaveCount(2)
      await watchTemporaryOrder(sidebar)

      await sidebar.getByRole("button", { name: "New Tab", exact: true }).click()
      await expect(
        sidebar.getByRole("region", { name: "Temporary tabs" }).getByRole("listitem"),
      ).toHaveCount(3)

      expect(await temporaryOrdersSeen(sidebar, background, site)).toStrictEqual(
        newTabsOnTop
          ? [
              ["/b", "/a"],
              ["chrome://newtab/", "/b", "/a"],
            ]
          : [
              ["/a", "/b"],
              ["/a", "/b", "chrome://newtab/"],
            ],
      )
    })
  })
}
