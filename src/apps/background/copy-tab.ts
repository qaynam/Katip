import { Effect, Match, Option, Result } from "effect"
import { markdownLinkOf } from "#modules/actions"
import { BrowserApiError, type BrowserTab } from "#platform/browser"
import { Clipboard } from "#platform/clipboard"
import { Scripting } from "#platform/scripting"
import { showPageToast } from "./page-toast"
import { SidebarHub } from "./sidebar-hub"
import { urlOf } from "./tab-admission"
import { currentTranslator } from "./translation"

export type CopyFormat = "Url" | "MarkdownLink"

/**
 * タブの URL を `format` の形でクリップボードに写し、写したことの知らせを表示する言語で返す。
 *
 * @remarks
 * URL を持たないタブ（読み込みを始める前の新しいタブなど）では、何も写さずに失敗する。
 */
export const copyTab = Effect.fnUntraced(function* (tab: BrowserTab, format: CopyFormat) {
  const url = urlOf(tab)
  if (url === "") {
    return yield* new BrowserApiError({ api: "clipboard", cause: "タブに URL が無い" })
  }
  const text = Match.value(format).pipe(
    Match.when("Url", () => url),
    Match.when("MarkdownLink", () =>
      markdownLinkOf({ title: Option.getOrElse(tab.title, () => ""), url }),
    ),
    Match.exhaustive,
  )
  yield* (yield* Clipboard).writeText(text)
  const translator = yield* currentTranslator
  return translator.t(format === "Url" ? "actions.copied.url" : "actions.copied.markdownLink")
})

// サイドパネルを閉じていても気づけるよう、写したタブのページの上に出す。chrome:// のページや、
// 許可の無いページには注入できないので、そのときだけサイドパネルに知らせる
const showNotice = Effect.fnUntraced(function* (tab: BrowserTab, notice: string) {
  const shownOnPage = yield* (yield* Scripting)
    .executeFunction(tab.id, showPageToast, [notice])
    .pipe(
      Effect.as(true),
      Effect.catch(() => Effect.succeed(false)),
    )
  if (!shownOnPage) yield* (yield* SidebarHub).notify(notice)
})

/**
 * {@link copyTab} で写し、写したこと（写せなければ写せなかったこと）を、写したタブのページの上に
 * 表示する。ページに表示できなければサイドパネルに知らせる。
 *
 * @returns 写せたか。
 */
export const copyTabWithNotice = Effect.fnUntraced(function* (tab: BrowserTab, format: CopyFormat) {
  const copied = yield* Effect.result(copyTab(tab, format))
  const notice = yield* Result.match(copied, {
    onSuccess: Effect.succeed,
    onFailure: (error) =>
      Effect.andThen(
        Effect.logWarning("タブの URL を写せなかった", error),
        Effect.map(currentTranslator, (translator) => translator.t("actions.copyFailed")),
      ),
  })
  yield* showNotice(tab, notice)
  return Result.isSuccess(copied)
})
