import { Effect, Layer } from "effect"
import { captureBrowserEvents, liveBrowserLayer } from "#platform/browser"
import { Clipboard } from "#platform/clipboard"
import { History } from "#platform/history"
import { Http } from "#platform/http"
import { KeyboardShortcuts } from "#platform/keyboard-shortcuts"
import { Permissions } from "#platform/permissions"
import { Scripting } from "#platform/scripting"
import { exposeLogsForDevelopment } from "./dev-log"
import { reloadOnRebuild } from "./dev-reload"
import { ExtensionInfo } from "./extension-info"
import { AcceptsExternalConnection, isLocalDevelopmentPage } from "./external-connection"
import { applicationLayer, program } from "./program"

if (import.meta.env.MODE === "development") exposeLogsForDevelopment()

// service worker を起こしたイベントを取りこぼさないよう、ほかの処理より先に同期的に購読する
const captured = captureBrowserEvents(chrome)

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

const layer = applicationLayer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      liveBrowserLayer(captured),
      ExtensionInfo.layer,
      Clipboard.layer,
      Http.layer,
      Permissions.layer,
      History.layer,
      KeyboardShortcuts.layer,
      Scripting.layer,
    ),
  ),
)

const runnable = program.pipe(Effect.scoped, Effect.provide(layer))

Effect.runFork(
  import.meta.env.MODE === "development"
    ? Effect.provideService(runnable, AcceptsExternalConnection, isLocalDevelopmentPage)
    : runnable,
)

// service worker では import() が使えないので静的に読み込み、本番ビルドでは分岐ごと消させる
if (import.meta.env.MODE === "development") void reloadOnRebuild()
