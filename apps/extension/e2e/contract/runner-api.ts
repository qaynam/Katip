import type { Observation } from "#platform/browser-contract"

/** What the contract extension's service worker exposes as `globalThis.katipContract`. */
export interface ContractRunner {
  readonly supportsSplitView: boolean
  readonly chromeVersion: number
  run(suiteName: string, scenarioName: string): Promise<Observation>
}
