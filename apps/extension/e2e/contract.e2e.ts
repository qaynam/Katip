import { test as base, expect, type Worker } from "@playwright/test"
import { contractSuites } from "#platform/browser-contract"
import { extensionWorkerOf, launchWithExtension } from "./browser-launch"
import type { ContractRunner } from "./contract/runner-api"
import { CONTRACT_EXTENSION_DIR } from "./extension-dir"

// Not one browser per scenario: with dozens of scenarios the launches alone would add up. Every
// scenario uses only the windows and bookmarks it opens, and cleans them up
const test = base.extend<object, { runner: Worker }>({
  runner: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads dependencies from the destructured argument
    async ({}, use) => {
      const { context, close } = await launchWithExtension(CONTRACT_EXTENSION_DIR)
      await use(await extensionWorkerOf(context))
      await close()
    },
    { scope: "worker" },
  ],
})

const browserOf = (worker: Worker) =>
  worker.evaluate(() => {
    const { supportsSplitView, chromeVersion } = (
      globalThis as unknown as { katipContract: ContractRunner }
    ).katipContract
    return { supportsSplitView, chromeVersion }
  })

for (const suite of contractSuites) {
  test.describe(`real Chrome ${suite.name}`, () => {
    for (const scenario of suite.scenarios) {
      test(scenario.name, async ({ runner }) => {
        const { supportsSplitView, chromeVersion } = await browserOf(runner)
        test.skip(
          scenario.splitView === "available" && !supportsSplitView,
          "Chrome without the split view API (154 or earlier)",
        )
        test.skip(
          scenario.splitView === "unavailable" && supportsSplitView,
          "Chrome with the split view API (155 or later)",
        )
        test.skip(
          scenario.skipBefore !== undefined && chromeVersion < scenario.skipBefore.chromeVersion,
          scenario.skipBefore?.reason,
        )

        const observed = await runner.evaluate(
          ([suiteName, scenarioName]) =>
            (globalThis as unknown as { katipContract: ContractRunner }).katipContract.run(
              suiteName,
              scenarioName,
            ),
          [suite.name, scenario.name] as const,
        )

        expect(observed).toStrictEqual(scenario.expected)
      })
    }
  })
}
