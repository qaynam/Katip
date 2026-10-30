import { Effect, Layer } from "effect"
import { captureBrowserEvents, liveBrowserLayer } from "#platform/browser"
import { ExtensionInfo } from "./extension-info"
import { applicationLayer, program } from "./program"

// service worker を起こしたイベントを取りこぼさないよう、何よりも先に同期的に購読する
const captured = captureBrowserEvents(chrome)

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

const layer = applicationLayer.pipe(
  Layer.provideMerge(Layer.mergeAll(liveBrowserLayer(captured), ExtensionInfo.layer)),
)

Effect.runFork(program.pipe(Effect.scoped, Effect.provide(layer)))

