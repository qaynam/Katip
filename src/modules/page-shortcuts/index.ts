// Web ページに注入するスクリプトも読み込むので、effect などのライブラリに依存させない。
// 依存すると、すべてのページでそのライブラリごと読み込まれる
export {
  type KeyboardPlatform,
  PAGE_SHORTCUTS,
  type PageShortcut,
  pageShortcutLabel,
  pageShortcutOf,
  type PressedKeys,
} from "./page-shortcut"
export { ENABLED_PAGE_SHORTCUTS_KEY, PAGE_SHORTCUT_PORT_NAME } from "./wire"
export { showPageToast } from "./page-toast"
