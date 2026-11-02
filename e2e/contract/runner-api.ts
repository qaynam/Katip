import type { Observation } from "#platform/browser-contract"

/** 契約を確かめる拡張の service worker が `globalThis.katipContract` に置くもの。 */
export interface ContractRunner {
  readonly supportsSplitView: boolean
  readonly chromeVersion: number
  run(suiteName: string, scenarioName: string): Promise<Observation>
}
