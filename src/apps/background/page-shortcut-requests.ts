import { Effect, Option, Schema, Stream } from "effect"
import type { PageShortcut } from "#modules/page-shortcuts"
import { type BrowserPort, Tabs } from "#platform/browser"
import { PageShortcutClientMessage, PageShortcutServerMessage } from "#protocol"
import { copyTab, type CopyFormat } from "./copy-tab"
import { currentPageShortcuts } from "./page-shortcut-sync"
import { currentTranslator } from "./translation"

const decodeClientMessage = Schema.decodeUnknownEffect(PageShortcutClientMessage)
const encodeServerMessage = Schema.encodeEffect(PageShortcutServerMessage)

const formatOf: Readonly<Record<PageShortcut, CopyFormat>> = {
  CopyUrl: "Url",
  CopyMarkdownLink: "MarkdownLink",
}

// 送れないのはページを閉じたか移動したときなので、送れなかった返事は捨てる
const reply = (port: BrowserPort, message: PageShortcutServerMessage) =>
  encodeServerMessage(message).pipe(
    Effect.orDie,
    Effect.flatMap((encoded) => port.post(encoded)),
    Effect.ignore,
  )

class PageShortcutRefused extends Schema.TaggedError<PageShortcutRefused>()("PageShortcutRefused", {
  reason: Schema.String,
}) {}

const copyForPage = Effect.fnUntraced(function* (port: BrowserPort, shortcut: PageShortcut) {
  // どのタブを写すかは Port の送信元で決める。ページから届いた値は、ページのスクリプトに
  // 書き換えられうるので信用しない
  const tabId = Option.flatMap(port.sender, (sender) =>
    sender.external ? Option.none() : sender.tabId,
  )
  if (Option.isNone(tabId)) {
    return yield* new PageShortcutRefused({ reason: "送信元のタブが分からない" })
  }
  // 有効な一覧をページが読み直す前に押されたキーや、無効にした後に残ったスクリプトからも届く
  if (!(yield* currentPageShortcuts).includes(shortcut)) {
    return yield* new PageShortcutRefused({ reason: `${shortcut} は有効になっていない` })
  }
  const tab = yield* (yield* Tabs).get(tabId.value)
  return yield* copyTab(tab, formatOf[shortcut])
})

const answer = (port: BrowserPort, shortcut: PageShortcut) =>
  copyForPage(port, shortcut).pipe(
    Effect.timeout("5 seconds"),
    Effect.matchEffect({
      onSuccess: (notice): Effect.Effect<PageShortcutServerMessage> =>
        Effect.succeed({ _tag: "Done", notice }),
      onFailure: (error) =>
        Effect.andThen(
          Effect.logWarning("ページのショートカットを実行できなかった", error),
          Effect.map(currentTranslator, (translator) => ({
            _tag: "Failed" as const,
            reason: translator.t("actions.copyFailed"),
          })),
        ),
    }),
  )

const servePort = (port: BrowserPort) =>
  port.messages.pipe(
    Stream.runForEach((raw) =>
      Effect.flatMap(Effect.option(decodeClientMessage(raw)), (message) =>
        Option.match(message, {
          onNone: () => Effect.void,
          onSome: ({ shortcut }) =>
            Effect.flatMap(answer(port, shortcut), (result) => reply(port, result)),
        }),
      ),
    ),
  )

/**
 * ページに注入したスクリプトからの接続を、切断されるまで受け持つ関数を作る。
 *
 * @remarks
 * 接続を振り分ける側でほかの Port の処理と同じように扱えるよう、要るサービスは作るときに捕まえ、
 * 返す関数は何も要求しない。
 */
export const makePageShortcutServer = Effect.map(
  Effect.context<Effect.Services<ReturnType<typeof servePort>>>(),
  (context) => (port: BrowserPort) => Effect.provideContext(servePort(port), context),
)
