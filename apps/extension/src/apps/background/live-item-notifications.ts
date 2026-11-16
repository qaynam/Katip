import { Array, Effect, Match, Option, Schema } from "effect"
import type { LiveArrival, LiveItem, LiveSource } from "#modules/live-folders"
import { PinnedBookmarks } from "#modules/pinned"
import { BookmarkId, type BrowserWindow, type WindowId, Windows } from "#platform/browser"
import { Notifications } from "#platform/notifications"
import { Permissions } from "#platform/permissions"
import { runSidebarCommand } from "./sidebar-commands"
import { currentTranslator } from "./translation"

// Not kept in memory: a click can wake the service worker long after the notification was shown,
// with nothing left from then but the notification's id
const NotifiedItem = Schema.fromJsonString(
  Schema.TaggedStruct("LiveItem", {
    folderId: BookmarkId,
    itemId: Schema.String,
    url: Schema.String,
  }),
)
const notificationIdOf = Schema.encodeSync(NotifiedItem)
const notifiedItemOf = Schema.decodeUnknownOption(NotifiedItem)

const TITLES_IN_SUMMARY = 3

const notableItems = (source: LiveSource, items: ReadonlyArray<LiveItem>) =>
  Match.valueTags(source, {
    // Not every unread mail: a folder of the whole inbox would announce every newsletter
    Gmail: () => items.filter((item) => item.isImportant === true),
    GitHub: () => items,
  })

const liveFolderTitleOf = (folderId: BookmarkId) =>
  PinnedBookmarks.use((pinned) => pinned.locate(folderId)).pipe(
    Effect.map(({ node }) =>
      node._tag === "PinnedLiveFolder" ? Option.some(node.title) : Option.none(),
    ),
    Effect.catchTag("PinnedNodeNotFound", () => Effect.succeedNone),
  )

/**
 * Shows the items that arrived in a live folder as a system notification, when Katip may show
 * notifications. A Gmail folder's notification has only the mail Gmail marks important, and a
 * GitHub folder's every new item.
 *
 * One item is shown with its title and subtitle. Several share one notification that counts them,
 * and clicking it opens the newest.
 */
export const notifyArrival = Effect.fnUntraced(function* ({
  folderId,
  source,
  items,
}: LiveArrival) {
  const notable = notableItems(source, items)
  const [newest] = notable
  if (newest === undefined) return
  if (!(yield* (yield* Permissions).containsPermission("notifications"))) return
  const folderTitle = yield* liveFolderTitleOf(folderId)
  if (Option.isNone(folderTitle)) return
  const translator = yield* currentTranslator
  yield* (yield* Notifications).show(
    notificationIdOf({ _tag: "LiveItem", folderId, itemId: newest.id, url: newest.url }),
    notable.length === 1
      ? { title: newest.title, message: newest.subtitle, contextMessage: folderTitle.value }
      : {
          title: translator.t(
            source._tag === "Gmail"
              ? "background.liveFolder.notification.importantMail"
              : "background.liveFolder.notification.newItems",
            { count: notable.length },
          ),
          message: notable
            .slice(0, TITLES_IN_SUMMARY)
            .map((item) => item.title)
            .join("\n"),
          contextMessage: folderTitle.value,
        },
  )
})

const isNormal = (window: BrowserWindow) => Option.contains(window.type, "normal")

// Not the last focused window whatever it is: that may be a popup such as Spotlight's, which has no
// tab strip to open a tab in
const windowToOpenIn = Effect.gen(function* () {
  const windows = yield* Windows
  const lastFocused = Option.filter(yield* Effect.option(windows.getLastFocused), isNormal)
  const window = Option.isSome(lastFocused)
    ? lastFocused
    : Array.findFirst(yield* windows.getAll, isNormal)
  return Option.map(window, ({ id }): WindowId => id)
})

/**
 * Opens the live item a clicked notification is about, the way clicking it in the side panel does,
 * in front in the last focused window, then clears the notification. Ignores notifications that
 * aren't about a live item.
 *
 * Opens the item's page all the same when the item has left its folder since, and in a new window
 * when no window is open.
 */
export const openNotifiedItem = Effect.fnUntraced(function* (notificationId: string) {
  const notified = notifiedItemOf(notificationId)
  if (Option.isNone(notified)) return
  const { folderId, itemId, url } = notified.value
  const windows = yield* Windows
  const window = yield* windowToOpenIn
  if (Option.isSome(window)) {
    yield* windows.update(window.value, { focused: true })
    const opened = yield* runSidebarCommand({
      _tag: "OpenLiveItem",
      windowId: window.value,
      bookmarkId: folderId,
      itemId,
    })
    if (opened._tag === "Failed") {
      yield* runSidebarCommand({ _tag: "OpenUrl", windowId: window.value, url })
    }
  } else {
    yield* windows.create({ url })
  }
  yield* (yield* Notifications).clear(notificationId)
})
