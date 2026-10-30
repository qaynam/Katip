import { Schema } from "effect"
import { PAGE_SHORTCUTS } from "#modules/page-shortcuts"

export { ENABLED_PAGE_SHORTCUTS_KEY, PAGE_SHORTCUT_PORT_NAME } from "#modules/page-shortcuts"

/** ページに注入するスクリプトの、拡張機能のルートから見た位置。 */
export const PAGE_SHORTCUT_SCRIPT_PATH = "page-shortcuts.js"

export const PageShortcut = Schema.Literals(PAGE_SHORTCUTS)

// 対象のタブは Port の送信元から決める。ページから届いた URL やタイトルは信用しない
export const PageShortcutClientMessage = Schema.TaggedUnion({
  Run: { shortcut: PageShortcut },
})
export type PageShortcutClientMessage = typeof PageShortcutClientMessage.Type

export const PageShortcutServerMessage = Schema.TaggedUnion({
  // ページに小さく表示する、表示する言語に訳した知らせ
  Done: { notice: Schema.String },
  Failed: { reason: Schema.String },
})
export type PageShortcutServerMessage = typeof PageShortcutServerMessage.Type
