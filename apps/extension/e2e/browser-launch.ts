import { chromium, type BrowserContext, type Worker } from "@playwright/test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * Launches Chrome with only the extension in `extensionDir`, on a throwaway profile.
 * Uses the executable in `KATIP_E2E_CHROME` when set.
 *
 * @param args - More command line switches for Chrome.
 */
export const launchWithExtension = async (
  extensionDir: string,
  args: ReadonlyArray<string> = [],
): Promise<{ readonly context: BrowserContext; readonly close: () => Promise<void> }> => {
  const userDataDir = await mkdtemp(join(tmpdir(), "katip-e2e-"))
  const executablePath = process.env.KATIP_E2E_CHROME
  const context = await chromium.launchPersistentContext(userDataDir, {
    ...(executablePath === undefined ? {} : { executablePath }),
    headless: true,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      ...args,
    ],
  })
  return {
    context,
    close: async () => {
      await context.close()
      await rm(userDataDir, { recursive: true, force: true })
    },
  }
}

export const extensionWorkerOf = async (context: BrowserContext): Promise<Worker> =>
  context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
