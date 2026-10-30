import { Context, Effect, Layer, Match, Option, Ref, Schema, Stream } from "effect"
import { Windows, type BrowserPort, type WindowId } from "#platform/browser"
import { ClientMessage, ServerMessage, type CommandOutcome, type SidebarCommand } from "#protocol"
import { buildSidebarView } from "./sidebar-view-source"

interface Subscriber {
  readonly id: number
  readonly port: BrowserPort
  /** None は最後にフォーカスされたウィンドウを追いかける購読（開発用ページ）。 */
  readonly windowId: Option.Option<WindowId>
}

const decodeClientMessage = Schema.decodeUnknownEffect(ClientMessage)
const encodeServerMessage = Schema.encodeEffect(ServerMessage)

const post = (port: BrowserPort, message: ServerMessage) =>
  encodeServerMessage(message).pipe(
    Effect.orDie,
    Effect.flatMap((encoded) => port.post(encoded)),
    Effect.as(true),
    // 切断の通知より先に送信が失敗することがある。購読の後始末は切断側で行う
    Effect.catch(() => Effect.succeed(false)),
  )

export class SidebarHub extends Context.Service<
  SidebarHub,
  {
    /**
     * サイドパネルからの接続を、切断されるまで受け持つ。
     *
     * @param run - 受け取ったコマンドの実行。失敗は `CommandOutcome` に含めて返すこと。
     */
    serve<R>(
      port: BrowserPort,
      run: (command: SidebarCommand) => Effect.Effect<CommandOutcome, never, R>,
    ): Effect.Effect<void, never, R>
    /** 購読中のすべてのサイドパネルへ、変化があったビューだけを送る。 */
    readonly publish: Effect.Effect<void>
    notify(message: string): Effect.Effect<void>
  }
>()("katip/background/SidebarHub") {
  static readonly layer = Layer.effect(
    SidebarHub,
    Effect.gen(function* () {
      const windows = yield* Windows
      // ビューの組み立てに要るサービスを構築時に捕まえ、publish を依存の無い Effect にする。
      // 呼び出し側（デバウンスや各ハンドラ）にサービスの一覧を漏らさないため
      const viewContext =
        yield* Effect.context<Effect.Services<ReturnType<typeof buildSidebarView>>>()
      const subscribers = yield* Ref.make<ReadonlyArray<Subscriber>>([])
      // ビューの全体を毎回送ると、タブの読み込み中にサイドパネルの再描画が止まらなくなる
      const lastSent = yield* Ref.make<ReadonlyMap<number, string>>(new Map())
      const nextId = yield* Ref.make(0)

      const resolveWindow = (subscriber: Subscriber) =>
        Option.match(subscriber.windowId, {
          onSome: Effect.succeed,
          onNone: () => Effect.map(windows.getLastFocused, (window) => window.id),
        })

      const publishTo = (subscriber: Subscriber) =>
        Effect.gen(function* () {
          const windowId = yield* resolveWindow(subscriber)
          const view = yield* buildSidebarView(windowId)
          if (Option.isNone(view)) return
          const message: ServerMessage = { _tag: "ViewUpdated", view: view.value }
          const encoded = JSON.stringify(yield* encodeServerMessage(message).pipe(Effect.orDie))
          const previous = (yield* Ref.get(lastSent)).get(subscriber.id)
          if (previous === encoded) return
          if (yield* post(subscriber.port, message)) {
            yield* Ref.update(lastSent, (sent) => new Map(sent).set(subscriber.id, encoded))
          }
        }).pipe(
          Effect.catchCause((cause) => Effect.logWarning("ビューを送れなかった", cause)),
          Effect.provideContext(viewContext),
        )

      const publish = Effect.flatMap(Ref.get(subscribers), (all) =>
        Effect.forEach(all, publishTo, { discard: true, concurrency: "unbounded" }),
      )

      const unsubscribe = (id: number) =>
        Effect.andThen(
          Ref.update(subscribers, (all) => all.filter((subscriber) => subscriber.id !== id)),
          Ref.update(lastSent, (sent) => {
            const next = new Map(sent)
            next.delete(id)
            return next
          }),
        )

      const serve = <R>(
        port: BrowserPort,
        run: (command: SidebarCommand) => Effect.Effect<CommandOutcome, never, R>,
      ) =>
        Effect.gen(function* () {
          const id = yield* Ref.getAndUpdate(nextId, (n) => n + 1)
          const handle = (message: ClientMessage) =>
            Match.value(message).pipe(
              Match.tagsExhaustive({
                Subscribe: ({ windowId }) =>
                  Effect.gen(function* () {
                    const subscriber = { id, port, windowId: Option.fromNullishOr(windowId) }
                    yield* unsubscribe(id)
                    yield* Ref.update(subscribers, (all) => [...all, subscriber])
                    yield* publishTo(subscriber)
                  }),
                Run: ({ requestId, command }) =>
                  Effect.flatMap(run(command), (outcome) =>
                    post(port, { _tag: "CommandSettled", requestId, outcome }),
                  ),
                KeepAlive: () => Effect.void,
              }),
            )
          yield* port.messages.pipe(
            Stream.runForEach((raw) =>
              Effect.flatMap(Effect.option(decodeClientMessage(raw)), (message) =>
                Option.match(message, { onNone: () => Effect.void, onSome: handle }),
              ),
            ),
            Effect.ensuring(unsubscribe(id)),
          )
        })

      const notify = (message: string) =>
        Effect.flatMap(Ref.get(subscribers), (all) =>
          Effect.forEach(all, (subscriber) => post(subscriber.port, { _tag: "Notice", message }), {
            discard: true,
          }),
        )

      return SidebarHub.of({ serve, publish, notify })
    }),
  )
}
