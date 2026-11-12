import { Effect, Layer } from "effect"
import { RootFolderTitle } from "#modules/pinned"
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

// Subscribed synchronously before anything else, so the event that woke the service worker isn't
// missed
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
    ? runnable.pipe(
        Effect.provideService(AcceptsExternalConnection, isLocalDevelopmentPage),
        Effect.provideService(RootFolderTitle, "Katip (dev)"),
      )
    : runnable,
)

// Imported statically, since a service worker can't use import(); production builds drop the
// whole branch
if (import.meta.env.MODE === "development") void reloadOnRebuild()
