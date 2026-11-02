import { Effect, type Scope } from "effect"
import type { BrowserApiError } from "#platform/browser"
import type { ContractRig } from "./contract-rig"
import { type ContractServices, makeStage, type Observation, type Stage } from "./stage"

/**
 * A browser behavior that must be observed identically on real Chrome and on the fake.
 * `expected` is what was observed on real Chrome.
 */
export interface ContractScenario {
  /** States the behavior as a spec. Used as the test name. */
  readonly name: string
  /**
   * Set only on scenarios whose outcome depends on the split view API (Chrome 155+).
   * On real Chrome, the scenario is skipped on versions that do not match.
   */
  readonly splitView?: "available" | "unavailable"
  /** Skipped on real Chrome older than this version. Always runs on the fake. */
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
