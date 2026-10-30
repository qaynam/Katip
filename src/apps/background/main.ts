import { Effect, Layer } from "effect"
import { captureBrowserEvents, liveBrowserLayer } from "#platform/browser"
import { reloadOnRebuild } from "./dev-reload"
import { ExtensionInfo } from "./extension-info"
import { applicationLayer, program } from "./program"

// service worker を起こしたイベントを取りこぼさないよう、何よりも先に同期的に購読する
const captured = captureBrowserEvents(chrome)

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

const layer = applicationLayer.pipe(
  Layer.provideMerge(Layer.mergeAll(liveBrowserLayer(captured), ExtensionInfo.layer)),
)

Effect.runFork(program.pipe(Effect.scoped, Effect.provide(layer)))

// service worker では import() が使えないので静的に読み込み、本番ビルドでは分岐ごと消させる
if (import.meta.env.MODE === "development") void reloadOnRebuild()
