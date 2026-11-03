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
 * Copies the tab's URL to the clipboard in `format`, and returns the notice saying so in the
 * display language.
 *
 * @remarks
 * Fails without copying anything for a tab with no URL, such as a new tab that hasn't started
 * loading.
 */
export const copyTab = Effect.fnUntraced(function* (tab: BrowserTab, format: CopyFormat) {
  const url = urlOf(tab)
  if (url === "") {
    return yield* new BrowserApiError({ api: "clipboard", cause: "the tab has no URL" })
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

// Not in the side panel, which may be closed, but on the copied tab's page. chrome:// pages and
// pages Katip has no access to can't be injected into, so only those fall back to the side panel
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
 * Copies with {@link copyTab}, and shows on the copied tab's page that it copied (or that it
 * couldn't). Tells the side panel instead when the page can't show it.
 *
 * @returns Whether it copied.
 */
export const copyTabWithNotice = Effect.fnUntraced(function* (tab: BrowserTab, format: CopyFormat) {
  const copied = yield* Effect.result(copyTab(tab, format))
  const notice = yield* Result.match(copied, {
    onSuccess: Effect.succeed,
    onFailure: (error) =>
      Effect.andThen(
        Effect.logWarning("Couldn't copy the tab's URL", error),
        Effect.map(currentTranslator, (translator) => translator.t("actions.copyFailed")),
      ),
  })
  yield* showNotice(tab, notice)
  return Result.isSuccess(copied)
})
