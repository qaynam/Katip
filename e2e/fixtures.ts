import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EXTENSION_DIR } from "./extension-dir"

interface KatipFixtures {
  /** パスをタイトルにしたページを返す、手元の Web サーバーの URL。例: `${site}/a` のタイトルは "Page /a" */
  site: string
  context: BrowserContext
  /** 拡張の service worker。chrome.* をそのまま呼んで、ブラウザの状態を仕込み、確かめる */
  background: Worker
  /** サイドパネルの画面を、同じウィンドウのタブとして開いたもの */
  sidebar: Page
}

export const test = base.extend<KatipFixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright は引数の分割代入から依存を読み取る
  site: async ({}, use) => {
    const server = createServer((request, response) => {
      const path = new URL(request.url ?? "/", "http://localhost").pathname
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      response.end(`<!doctype html><title>Page ${path}</title><p>${path}</p>`)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    // Chrome が保つ keep-alive の接続を切らないと、close が終わらない
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright は引数の分割代入から依存を読み取る
  context: async ({}, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), "katip-e2e-"))
    const executablePath = process.env.KATIP_E2E_CHROME
    const context = await chromium.launchPersistentContext(userDataDir, {
      ...(executablePath === undefined ? {} : { executablePath }),
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    })
    await use(context)
    await context.close()
    await rm(userDataDir, { recursive: true, force: true })
  },

  background: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
    await use(worker)
  },

  sidebar: async ({ context, background }, use) => {
    const extensionId = new URL(background.url()).host
    const page = context.pages()[0] ?? (await context.newPage())
    await page.goto(`chrome-extension://${extensionId}/sidepanel/index.html`)
    await use(page)
  },
})

export { expect } from "@playwright/test"
