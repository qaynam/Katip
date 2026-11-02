import { Clock, Effect, Option, Schema, Stream } from "effect"
import { buildExport, encodeExportFile } from "#modules/export"
import { LiveFolders } from "#modules/live-folders"
import { FolderIconStore, PinnedBookmarks } from "#modules/pinned"
import { SettingsRepository } from "#modules/settings"
import { type BrowserPort, Tabs } from "#platform/browser"
import { ExportClientMessage, ExportServerMessage } from "#protocol"
import { ExtensionInfo } from "./extension-info"
import { KatipState } from "./katip-state"

/** The current state, as the content of an export file. */
export const exportFileContent = Effect.gen(function* () {
  const state = yield* KatipState
  const extension = yield* ExtensionInfo
  const document = yield* Effect.fromResult(
    buildExport({
      exportedAt: yield* Clock.currentTimeMillis,
      katipVersion: extension.version,
      extensionOrigin: extension.origin,
      spaces: yield* state.spaces.get,
      pinnedTrees: yield* (yield* PinnedBookmarks).loadAllSpaceTrees,
      folderIcons: yield* (yield* FolderIconStore).load,
      liveSorts: (yield* (yield* LiveFolders).snapshot).sorts,
      workspace: yield* state.workspace.get,
      tabs: yield* (yield* Tabs).query({}),
      settings: yield* (yield* SettingsRepository).get,
    }),
  )
  return yield* Effect.fromResult(encodeExportFile(document))
})

const decodeClientMessage = Schema.decodeUnknownEffect(ExportClientMessage)
const encodeServerMessage = Schema.encodeEffect(ExportServerMessage)

// A reply only fails to send once the settings page has closed, so a failed reply is dropped
const reply = (port: BrowserPort, message: ExportServerMessage) =>
  encodeServerMessage(message).pipe(
    Effect.orDie,
    Effect.flatMap((encoded) => port.post(encoded)),
    Effect.ignore,
  )

/**
 * Serves export requests from the settings page until it disconnects.
 *
 * @param content - Builds the content of the export file.
 */
export const serveDataExport = <E, R>(port: BrowserPort, content: Effect.Effect<string, E, R>) =>
  port.messages.pipe(
    Stream.runForEach((raw) =>
      Effect.flatMap(Effect.option(decodeClientMessage(raw)), (message) =>
        Option.isNone(message)
          ? Effect.void
          : content.pipe(
              // Answers even on a defect: without an answer, the settings page can't report the
              // failure until its timeout passes
              Effect.matchCauseEffect({
                onSuccess: (exported): Effect.Effect<ExportServerMessage> =>
                  Effect.succeed({ _tag: "Exported", content: exported }),
                onFailure: (cause) =>
                  Effect.as(Effect.logError("Couldn't export the data", cause), {
                    _tag: "Failed" as const,
                  }),
              }),
              Effect.flatMap((answer) => reply(port, answer)),
            ),
      ),
    ),
  )
