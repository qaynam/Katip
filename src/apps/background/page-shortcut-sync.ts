import { Effect, Option, Schema, Semaphore } from "effect"
import { PAGE_SHORTCUTS, type PageShortcut } from "#modules/page-shortcuts"
import { type PageShortcutSettings, SettingsRepository } from "#modules/settings"
import { Storage, Tabs } from "#platform/browser"
import { Permissions } from "#platform/permissions"
import { type ContentScriptRegistration, Scripting } from "#platform/scripting"
import {
  ENABLED_PAGE_SHORTCUTS_KEY,
  PAGE_SHORTCUT_SCRIPT_PATH,
  PageShortcut as PageShortcutSchema,
} from "#protocol"

/** ページのショートカットに要る、すべてのサイトへのアクセスの許可。 */
export const ALL_SITES_ORIGIN = "*://*/*"

export const PAGE_SHORTCUT_SCRIPT: ContentScriptRegistration = {
  id: "katip-page-shortcuts",
  js: [PAGE_SHORTCUT_SCRIPT_PATH],
  matches: [ALL_SITES_ORIGIN],
  // ページのスクリプトより先にキーを受け取れるよう、読み込みの最初に入れる
  runAt: "document_start",
  allFrames: false,
  persistAcrossSessions: true,
}

const settingOf: Readonly<Record<PageShortcut, keyof PageShortcutSettings>> = {
  CopyUrl: "copyUrl",
  CopyMarkdownLink: "copyMarkdownLink",
}

/**
 * 設定で使うことにしたショートカット。すべてのサイトへのアクセスが許可されていなければ、
 * ページでキーを受け取れないので、どれも有効にならない。
 */
export const enabledPageShortcuts = (
  settings: PageShortcutSettings,
  canReachAllSites: boolean,
): ReadonlyArray<PageShortcut> =>
  canReachAllSites ? PAGE_SHORTCUTS.filter((shortcut) => settings[settingOf[shortcut]]) : []

export const currentPageShortcuts = Effect.gen(function* () {
  const settings = yield* (yield* SettingsRepository).get
  const canReachAllSites = yield* (yield* Permissions).containsOrigin(ALL_SITES_ORIGIN)
  return enabledPageShortcuts(settings.pageShortcuts, canReachAllSites)
})

const EnabledPageShortcuts = Schema.Array(PageShortcutSchema)

const isWebPage = (url: string) => url.startsWith("http://") || url.startsWith("https://")

// 登録したスクリプトは、登録した後に読み込んだページにしか入らない。すでに開いているページでも
// すぐ使えるよう一度だけ入れる。許可の無いページや破棄したタブでは失敗するが、構わない
const injectIntoOpenWebPages = Effect.gen(function* () {
  const scripting = yield* Scripting
  const tabs = yield* (yield* Tabs).query({})
  yield* Effect.forEach(
    tabs.filter((tab) => Option.exists(tab.url, isWebPage)),
    (tab) => Effect.ignore(scripting.executeScript(tab.id, PAGE_SHORTCUT_SCRIPT.js)),
    { concurrency: 8, discard: true },
  )
})

/**
 * - `"WhenNewlyEnabled"`: どれも有効でなかった状態から有効になったときだけ、開いているページに入れる
 * - `"Always"`: 有効なら必ず入れる。拡張機能を更新して、古いスクリプトが動かなくなったとき用
 */
export type OpenPageInjection = "WhenNewlyEnabled" | "Always"

const syncPageShortcuts = Effect.fnUntraced(function* (injection: OpenPageInjection) {
  const enabled = yield* currentPageShortcuts
  const storage = (yield* Storage).local
  const previous = yield* storage.getDecoded(ENABLED_PAGE_SHORTCUTS_KEY, EnabledPageShortcuts).pipe(
    Effect.map(Option.getOrElse((): ReadonlyArray<PageShortcut> => [])),
    Effect.catchTag("StorageDecodeError", () => Effect.succeed([])),
  )
  // 注入済みのスクリプトは、この一覧でキーを横取りするかを決める。登録を外しても注入済みの
  // ページには残るので、一覧を先に書き換えて横取りをやめさせる
  yield* storage.set(ENABLED_PAGE_SHORTCUTS_KEY, enabled)

  const scripting = yield* Scripting
  const isRegistered =
    (yield* scripting.getRegisteredContentScripts([PAGE_SHORTCUT_SCRIPT.id])).length > 0
  if (enabled.length === 0) {
    if (isRegistered) yield* scripting.unregisterContentScripts([PAGE_SHORTCUT_SCRIPT.id])
    return
  }
  yield* isRegistered
    ? scripting.updateContentScripts([PAGE_SHORTCUT_SCRIPT])
    : scripting.registerContentScripts([PAGE_SHORTCUT_SCRIPT])
  if (injection === "Always" || previous.length === 0) yield* injectIntoOpenWebPages
})

/**
 * 有効なショートカットに合わせて、ページのスクリプトの登録と、有効な一覧の保存を同期する関数を作る。
 *
 * @remarks
 * 同期は 1 つずつ進める。設定と許可の変化が同時に届いても、同じページに二重に入れないため。
 */
export const makePageShortcutSync = Effect.map(
  Semaphore.make(1),
  (lock) => (injection: OpenPageInjection) =>
    Semaphore.withPermits(lock, 1)(syncPageShortcuts(injection)),
)
