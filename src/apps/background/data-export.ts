import { Clock, Effect, Option, Schema, Stream } from "effect"
import { buildExport, encodeExportFile } from "#modules/export"
import { LiveFolders } from "#modules/live-folders"
import { FolderIconStore, PinnedBookmarks } from "#modules/pinned"
import { SettingsRepository } from "#modules/settings"
import { type BrowserPort, Tabs } from "#platform/browser"
import { ExportClientMessage, ExportServerMessage } from "#protocol"
import { ExtensionInfo } from "./extension-info"
import { KatipState } from "./katip-state"

/** 今の状態を、書き出しファイルの中身にする。 */
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

// 送れないのは設定画面を閉じたときなので、送れなかった返事は捨てる
const reply = (port: BrowserPort, message: ExportServerMessage) =>
  encodeServerMessage(message).pipe(
    Effect.orDie,
    Effect.flatMap((encoded) => port.post(encoded)),
    Effect.ignore,
  )

/**
 * 設定画面からの書き出しの求めを、切断されるまで受け持つ。
 *
 * @param content - 書き出しファイルの中身を作る。
 */
export const serveDataExport = <E, R>(port: BrowserPort, content: Effect.Effect<string, E, R>) =>
  port.messages.pipe(
    Stream.runForEach((raw) =>
      Effect.flatMap(Effect.option(decodeClientMessage(raw)), (message) =>
        Option.isNone(message)
          ? Effect.void
          : content.pipe(
              // 欠陥でも返事をする。返事が無いと、設定画面は待ち時間が過ぎるまで失敗を知らせられない
              Effect.matchCauseEffect({
                onSuccess: (exported): Effect.Effect<ExportServerMessage> =>
                  Effect.succeed({ _tag: "Exported", content: exported }),
                onFailure: (cause) =>
                  Effect.as(Effect.logError("書き出せなかった", cause), {
                    _tag: "Failed" as const,
                  }),
              }),
              Effect.flatMap((answer) => reply(port, answer)),
            ),
      ),
    ),
  )
