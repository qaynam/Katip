import { test as base, expect, type Worker } from "@playwright/test"
import { contractSuites } from "#platform/browser-contract"
import { extensionWorkerOf, launchWithExtension } from "./browser-launch"
import type { ContractRunner } from "./contract/runner-api"
import { CONTRACT_EXTENSION_DIR } from "./extension-dir"

// 場面はどれも自分で開いたウィンドウとブックマークだけを使い、終わると片付ける。
// 場面ごとに Chrome を起動し直すと、数十の場面で起動待ちだけが積み上がる
const test = base.extend<object, { runner: Worker }>({
  runner: [
    // eslint-disable-next-line no-empty-pattern -- Playwright は引数の分割代入から依存を読み取る
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
  test.describe(`本物の Chrome の ${suite.name}`, () => {
    for (const scenario of suite.scenarios) {
      test(scenario.name, async ({ runner }) => {
        const { supportsSplitView, chromeVersion } = await browserOf(runner)
        test.skip(
          scenario.splitView === "available" && !supportsSplitView,
          "分割ビューの API が無い Chrome（154 以前）",
        )
        test.skip(
          scenario.splitView === "unavailable" && supportsSplitView,
          "分割ビューの API がある Chrome（155 以降）",
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
