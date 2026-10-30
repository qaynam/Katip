/** Web ページを見ている間に使えるショートカット。設定で個別に有効にする。 */
export const PAGE_SHORTCUTS = ["CopyUrl", "CopyMarkdownLink"] as const
export type PageShortcut = (typeof PAGE_SHORTCUTS)[number]

/** Mac では Command、それ以外では Ctrl が主な修飾キーになる。 */
export type KeyboardPlatform = "mac" | "other"

/** `KeyboardEvent` のうち、ショートカットの判定に使う部分。 */
export interface PressedKeys {
  /** 押したキーの位置。Option との組み合わせで `key` は「ç」などに変わるので、位置で判定する。 */
  readonly code: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
}

const withAlt: Readonly<Record<PageShortcut, boolean>> = {
  CopyUrl: false,
  CopyMarkdownLink: true,
}

/** 押されたキーが当たるショートカット。当たらなければ null。 */
export const pageShortcutOf = (
  keys: PressedKeys,
  platform: KeyboardPlatform,
): PageShortcut | null => {
  const primary = platform === "mac" ? keys.metaKey && !keys.ctrlKey : keys.ctrlKey && !keys.metaKey
  if (!primary || !keys.shiftKey || keys.code !== "KeyC") return null
  return keys.altKey ? "CopyMarkdownLink" : "CopyUrl"
}

/** 画面に出すキーの書き方。Mac は「⌥⇧⌘C」、それ以外は「Ctrl+Shift+Alt+C」。 */
export const pageShortcutLabel = (shortcut: PageShortcut, platform: KeyboardPlatform): string =>
  platform === "mac"
    ? `${withAlt[shortcut] ? "⌥" : ""}⇧⌘C`
    : `Ctrl+Shift+${withAlt[shortcut] ? "Alt+" : ""}C`
