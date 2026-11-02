import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { FakeBrowser } from "#platform/browser-testing"
import { ContractRig } from "./contract-rig"
import { contractSuites } from "./contract-suites"
import { type ContractScenario, runContractScenario } from "./scenario"

const fakeRig = Layer.effect(
  ContractRig,
  FakeBrowser.use((fake) => Effect.succeed(ContractRig.of({ takeEvents: fake.takeEmittedEvents }))),
)

const fakeBrowserFor = (scenario: ContractScenario) =>
  fakeRig.pipe(
    Layer.provideMerge(
      FakeBrowser.layerWith({ supportsSplitView: scenario.splitView !== "unavailable" }),
    ),
  )

for (const suite of contractSuites) {
  describe(`fake の ${suite.name} は本物の Chrome と同じように振る舞う`, () => {
    for (const scenario of suite.scenarios) {
      it.effect(scenario.name, () =>
        runContractScenario(scenario).pipe(
          Effect.map((observed) => assert.deepStrictEqual(observed, scenario.expected)),
          Effect.provide(fakeBrowserFor(scenario)),
        ),
      )
    }
  })
}
