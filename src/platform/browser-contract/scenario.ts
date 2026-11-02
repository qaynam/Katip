import { Effect, type Scope } from "effect"
import type { BrowserApiError } from "#platform/browser"
import type { ContractRig } from "./contract-rig"
import { type ContractServices, makeStage, type Observation, type Stage } from "./stage"

/**
 * 本物の Chrome と fake の両方で同じ観察結果になるべき、ブラウザの振る舞い。
 * `expected` は本物の Chrome で観察した結果。
 */
export interface ContractScenario {
  /** 振る舞いを仕様として表す名前。テスト名になる。 */
  readonly name: string
  /**
   * 分割ビューを作る・解く API（Chrome 155 以降）の有無で結果が変わる場面だけが持つ。
   * 本物の Chrome では、合わない版なら実行しない。
   */
  readonly splitView?: "available" | "unavailable"
  /** これより前の版の本物の Chrome では実行しない。fake ではいつも実行する。 */
  readonly skipBefore?: { readonly chromeVersion: number; readonly reason: string }
  readonly run: (
    stage: Stage,
  ) => Effect.Effect<Observation, BrowserApiError, ContractServices | Scope.Scope>
  readonly expected: Observation
}

export interface ContractSuite {
  readonly name: string
  readonly scenarios: ReadonlyArray<ContractScenario>
}

export const runContractScenario = (
  scenario: ContractScenario,
): Effect.Effect<Observation, BrowserApiError, ContractServices | ContractRig> =>
  Effect.scoped(Effect.flatMap(makeStage, scenario.run))
