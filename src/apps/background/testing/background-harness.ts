import { Array, Effect, Layer, Option, Ref, Schedule, Schema, Stream } from "effect"
import { FakeBrowser } from "#platform/browser-testing"
import { ClipboardRecorder } from "#platform/clipboard"
import { FakeHistory } from "#platform/history"
import { FakeHttp } from "#platform/http"
import { KeyboardShortcuts } from "#platform/keyboard-shortcuts"
import { FakePermissions } from "#platform/permissions"
import { FakeScripting } from "#platform/scripting"
import type { WindowId } from "#platform/browser"
import {
  ClientMessage,
  RequestId,
  ServerMessage,
  SIDEBAR_PORT_NAME,
  type CommandOutcome,
  type SidebarCommand,
  type SidebarView,
  type SpaceView,
} from "#protocol"
import { ExtensionInfo } from "../extension-info"
import { applicationLayer, program } from "../program"
import { BrowserLanguages } from "../translation"

/** ブラウザの fake だけを `browser` に差し替えた、background のテスト用のレイヤー。 */
export const backgroundTestLayerWith = (browser: typeof FakeBrowser.layer) =>
  Layer.mergeAll(
    browser,
    ClipboardRecorder.layer,
    FakeHttp.layer,
    FakePermissions.layer,
    FakeHistory.layer,
    FakeScripting.layer,
    KeyboardShortcuts.layerTest({}),
    // 知らせや操作の名前を、テストを動かす環境の言語によらず日本語で期待できるようにする
    Layer.succeed(BrowserLanguages, ["ja"]),
  )

export const backgroundTestLayer = backgroundTestLayerWith(FakeBrowser.layer)

/**
 * background を起動する。
 *
 * 保存値は起動時に読み込まれるので、storage への仕込みはこれより前に済ませる。
 * レイヤーをテストの外側で作ると、仕込む前の空の storage を読んでしまう。
 */
export const startBackground = Effect.forkScoped(
  program.pipe(Effect.provide(applicationLayer.pipe(Layer.provideMerge(ExtensionInfo.layerTest)))),
)

class NotYet extends Schema.TaggedError<NotYet>()("NotYet", {}) {}

/** 条件を満たす値が得られるまで、短い間隔で数秒間問い合わせ続ける。 */
export const eventually = <A, E, R>(probe: Effect.Effect<Option.Option<A>, E, R>) =>
  probe.pipe(
    Effect.flatMap(
      Option.match({ onNone: () => Effect.fail(new NotYet()), onSome: Effect.succeed }),
    ),
    Effect.retry({ schedule: Schedule.spaced("10 millis"), times: 300 }),
  )

const encodeClientMessage = Schema.encodeEffect(ClientMessage)
const decodeServerMessage = Schema.decodeUnknownEffect(ServerMessage)

/**
 * サイドパネルとして background に接続し、届いたビューとコマンドの結果を受け取る。
 */
export const openSidebar = (windowId: WindowId) =>
  Effect.gen(function* () {
    const fake = yield* FakeBrowser
    const port = yield* fake.connect(SIDEBAR_PORT_NAME)
    const views = yield* Ref.make<ReadonlyArray<SidebarView>>([])
    // 結果を受け取った時点で届いていたビューの数も覚え、それより後のビューだけを結果の反映とみなす
    const outcomes = yield* Ref.make<
      ReadonlyMap<number, { readonly outcome: CommandOutcome; readonly viewsBefore: number }>
    >(new Map())
    const nextRequestId = yield* Ref.make(1)
    const notices = yield* Ref.make<ReadonlyArray<string>>([])
    const firstFreshView = yield* Ref.make(0)

    yield* port.messages.pipe(
      Stream.mapEffect((raw) => decodeServerMessage(raw)),
      Stream.runForEach((message) => {
        switch (message._tag) {
          case "ViewUpdated":
            return Ref.update(views, (all) => [...all, message.view])
          case "CommandSettled":
            return Effect.flatMap(Ref.get(views), (received) =>
              Ref.update(outcomes, (all) =>
                new Map(all).set(message.requestId, {
                  outcome: message.outcome,
                  viewsBefore: received.length,
                }),
              ),
            )
          case "Notice":
            return Ref.update(notices, (all) => [...all, message.message])
        }
      }),
      Effect.forkScoped,
    )

    const send = (message: ClientMessage) =>
      Effect.flatMap(encodeClientMessage(message), (encoded) => port.post(encoded))

    yield* send({ _tag: "Subscribe", windowId })

    const viewWhere = (predicate: (view: SidebarView) => boolean) =>
      eventually(
        Effect.map(Effect.all([Ref.get(views), Ref.get(firstFreshView)]), ([all, first]) =>
          Array.findLast(all.slice(first), predicate),
        ),
      )

    const run = (command: SidebarCommand) =>
      Effect.gen(function* () {
        const requestId = RequestId.make(yield* Ref.getAndUpdate(nextRequestId, (n) => n + 1))
        yield* send({ _tag: "Run", requestId, command })
        const settled = yield* eventually(
          Effect.map(Ref.get(outcomes), (all) => Option.fromNullishOr(all.get(requestId))),
        )
        yield* Ref.set(firstFreshView, settled.viewsBefore)
        return settled.outcome
      })

    const noticeWhere = (predicate: (notice: string) => boolean) =>
      eventually(Effect.map(Ref.get(notices), (all) => Array.findLast(all, predicate)))

    return { viewWhere, run, noticeWhere }
  })

export const spaceNamed = (view: SidebarView, name: string): Option.Option<SpaceView> =>
  Array.findFirst(view.spaces, (space) => space.name === name)
