import { Effect, Option, Schema, Stream } from "effect"
import { SettingsRepository } from "#modules/settings"
import { type BrowserPort, type BrowserTab, Tabs } from "#platform/browser"
import { Scripting } from "#platform/scripting"
import { PAGE_NOTICE_PORT_NAME, PageNoticeClick } from "#protocol"
import { type PageNotice, showPageToast } from "./page-toast"
import { SidebarHub } from "./sidebar-hub"
import { currentTranslator } from "./translation"

const encodeClick = Schema.encodeSync(PageNoticeClick)
const decodeClick = Schema.decodeUnknownOption(PageNoticeClick)

// Only while the page that opened it is the one in front: a tab opened from a page left behind
// meanwhile, or by something other than a page, has no page in front to tell of it
const pageInFrontThatOpened = Effect.fnUntraced(function* (tab: BrowserTab) {
  if (tab.active || Option.isNone(tab.openerTabId)) return Option.none<BrowserTab>()
  const opener = yield* Effect.option((yield* Tabs).get(tab.openerTabId.value))
  return Option.filter(opener, (page) => page.active && page.windowId === tab.windowId)
})

/**
 * When the setting is on, tells of a tab opened in the background from the page in front, as by
 * ⌘-clicking a link, on that page. Clicking the notice brings the tab to the front.
 *
 * @remarks
 * A page Katip can't put a notice into, such as a chrome:// page, has the window's side panel tell
 * of it instead.
 */
export const noticeBackgroundTab = Effect.fnUntraced(function* (tab: BrowserTab) {
  if (!(yield* (yield* SettingsRepository).get).backgroundTabNotices) return
  const page = yield* pageInFrontThatOpened(tab)
  if (Option.isNone(page)) return
  const title = (yield* currentTranslator).t("background.backgroundTab.opened")
  const notice: PageNotice = {
    tone: "Opened",
    title,
    action: {
      _tag: "Post",
      portName: PAGE_NOTICE_PORT_NAME,
      message: encodeClick({ _tag: "SwitchToTab", tabId: tab.id }),
    },
  }
  const shownOnPage = yield* (yield* Scripting)
    .executeFunction(page.value.id, showPageToast, [notice])
    .pipe(
      Effect.as(true),
      Effect.catch(() => Effect.succeed(false)),
    )
  if (!shownOnPage) {
    yield* (yield* SidebarHub).notify(title, { windowId: tab.windowId, switchToTabId: tab.id })
  }
})

// Only to a tab in the window of the page the notice was on: a notice is never about another one
const switchFromPage = Effect.fnUntraced(function* (port: BrowserPort, click: PageNoticeClick) {
  const pageTabId = Option.flatMap(port.sender, (sender) => sender.tabId)
  if (Option.isNone(pageTabId)) return
  const tabs = yield* Tabs
  const page = yield* tabs.get(pageTabId.value)
  const tab = yield* tabs.get(click.tabId)
  if (tab.windowId === page.windowId) yield* tabs.update(tab.id, { active: true })
})

/** Serves the one click a notice on a page sends, then hangs up. */
export const servePageNotice = (port: BrowserPort) =>
  port.messages.pipe(
    Stream.runHead,
    Effect.flatMap((raw) =>
      Option.match(Option.flatMap(raw, decodeClick), {
        onNone: () => Effect.void,
        onSome: (click) => switchFromPage(port, click),
      }),
    ),
    Effect.catch((error) => Effect.logWarning("Couldn't switch to the tab of a notice", error)),
    Effect.ensuring(port.disconnect),
  )
