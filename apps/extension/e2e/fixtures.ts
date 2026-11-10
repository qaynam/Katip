import { test as base, type BrowserContext, type Page, type Worker } from "@playwright/test"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { extensionWorkerOf, launchWithExtension, onboardingPageOf } from "./browser-launch"
import { EXTENSION_DIR } from "./extension-dir"

interface KatipFixtures {
  /**
   * URL of a local web server whose pages are titled after their path, e.g. `${site}/a` is
   * "Page /a". A page links to the paths in its `links` parameter, each opening in a new tab:
   * `${site}/a?links=/x,/y`.
   */
  site: string
  context: BrowserContext
  /** The extension's service worker. Calls chrome.* directly to arrange and inspect browser state. */
  background: Worker
  /** The side panel page, opened as a tab in the same window. */
  sidebar: Page
}

export const test = base.extend<KatipFixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright reads dependencies from the destructured argument
  site: async ({}, use) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://localhost")
      const links = (url.searchParams.get("links") ?? "")
        .split(",")
        .filter((path) => path !== "")
        .map((path) => `<a href="${path}" target="_blank">${path}</a>`)
        .join(" ")
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      response.end(
        `<!doctype html><title>Page ${url.pathname}</title><p>${url.pathname}</p>${links}`,
      )
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    // close never finishes while Chrome keeps its keep-alive connections open
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright reads dependencies from the destructured argument
  context: async ({}, use) => {
    const { context, close } = await launchWithExtension(EXTENSION_DIR)
    await use(context)
    await close()
  },

  background: async ({ context }, use) => {
    await use(await extensionWorkerOf(context))
  },

  // In the tab the onboarding opened in: Katip keeps its own pages out of Spaces, so the tab joins
  // none, while the blank tab Chrome starts with joined the current Space when Katip started, and
  // is closed so the Space starts empty
  sidebar: async ({ context, background }, use) => {
    const extensionId = new URL(background.url()).host
    const page = await onboardingPageOf(context)
    await page.goto(`chrome-extension://${extensionId}/sidepanel/index.html`)
    await Promise.all(
      context
        .pages()
        .filter((each) => each !== page)
        .map((each) => each.close()),
    )
    await use(page)
  },
})

export { expect } from "@playwright/test"
