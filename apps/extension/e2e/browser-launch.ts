import { chromium, type BrowserContext, type Worker } from "@playwright/test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * Launches Chrome on the profile in `userDataDir` with only the extension in `extensionDir`.
 * Uses the executable in `KATIP_E2E_CHROME` when set.
 *
 * @param args - More command line switches for Chrome.
 */
export const launchInProfile = (
  userDataDir: string,
  extensionDir: string,
  args: ReadonlyArray<string> = [],
): Promise<BrowserContext> => {
  const executablePath = process.env.KATIP_E2E_CHROME
  return chromium.launchPersistentContext(userDataDir, {
    ...(executablePath === undefined ? {} : { executablePath }),
    headless: true,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      // The side panel asks GitHub for the latest release when it opens. Tests must depend neither
      // on the network nor on GitHub's rate limit, and a newer release mustn't put a card in the way
      "--host-resolver-rules=MAP api.github.com ~NOTFOUND",
      ...args,
    ],
  })
}

/**
 * Launches Chrome with only the extension in `extensionDir`, on a throwaway profile, as
 * {@link launchInProfile} does.
 */
export const launchWithExtension = async (
  extensionDir: string,
  args: ReadonlyArray<string> = [],
): Promise<{ readonly context: BrowserContext; readonly close: () => Promise<void> }> => {
  const userDataDir = await mkdtemp(join(tmpdir(), "katip-e2e-"))
  const context = await launchInProfile(userDataDir, extensionDir, args)
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
