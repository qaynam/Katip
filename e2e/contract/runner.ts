import { Effect, Layer } from "effect"
import { captureBrowserEvents, liveBrowserLayer } from "#platform/browser"
import {
  ContractRig,
  contractSuites,
  type Observation,
  runContractScenario,
} from "#platform/browser-contract"
import type { ContractRunner } from "./runner-api"

const captured = captureBrowserEvents(chrome)
const layer = ContractRig.live.pipe(Layer.provideMerge(liveBrowserLayer(captured)))

const run = (suiteName: string, scenarioName: string): Promise<Observation> => {
  const scenario = contractSuites
    .find((suite) => suite.name === suiteName)
    ?.scenarios.find((candidate) => candidate.name === scenarioName)
  if (scenario === undefined) {
    return Promise.reject(new Error(`契約の場面が無い: ${suiteName} / ${scenarioName}`))
  }
  return Effect.runPromise(runContractScenario(scenario).pipe(Effect.provide(layer)))
}

const runner: ContractRunner = {
  supportsSplitView: typeof chrome.tabs.createSplit === "function",
  chromeVersion: Number(/Chrome\/(\d+)/.exec(navigator.userAgent)?.[1] ?? 0),
  run,
}

Object.assign(globalThis, { katipContract: runner })
