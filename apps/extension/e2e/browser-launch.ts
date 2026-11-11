import {
  chromium,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
  type Worker,
} from "@playwright/test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * Launches Chrome on the profile in `userDataDir` with only the extension in `extensionDir`.
 * Uses the executable in `KATIP_E2E_CHROME` when set.
 *
 * @param args - More command line switches for Chrome.
 * @param display - The pixel density pages render at, when not the usual one.
 */
export const launchInProfile = (
  userDataDir: string,
  extensionDir: string,
  args: ReadonlyArray<string> = [],
  display: Pick<BrowserContextOptions, "deviceScaleFactor"> = {},
): Promise<BrowserContext> => {
  const executablePath = process.env.KATIP_E2E_CHROME
  return chromium.launchPersistentContext(userDataDir, {
    ...(executablePath === undefined ? {} : { executablePath }),
    ...display,
    headless: true,
    // Folders slide open and closed over a fraction of a second, and steps that measure where rows
    // are, such as drags, would measure them mid-slide
    reducedMotion: "reduce",
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
  display: Pick<BrowserContextOptions, "deviceScaleFactor"> = {},
): Promise<{ readonly context: BrowserContext; readonly close: () => Promise<void> }> => {
  const userDataDir = await mkdtemp(join(tmpdir(), "katip-e2e-"))
  const context = await launchInProfile(userDataDir, extensionDir, args, display)
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

const isOnboarding = (page: Page) => page.url().includes("/onboarding/index.html")

/** The page Katip opens in a tab when it is installed, once it has opened. */
export const onboardingPageOf = async (context: BrowserContext): Promise<Page> => {
  for (let waited = 0; waited < 10_000; waited += 50) {
    const opened = context.pages().find(isOnboarding)
    if (opened !== undefined) return opened
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error("Katip's onboarding didn't open")
}

/**
 * Closes the onboarding a fresh install opens, so that a test starts from the browser as the
 * person left it.
 */
export const closeOnboarding = async (context: BrowserContext): Promise<void> => {
  await (await onboardingPageOf(context)).close()
}
