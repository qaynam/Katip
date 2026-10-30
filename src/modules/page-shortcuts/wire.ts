/** Web ページに注入したスクリプトが、ショートカットを押されるたびに background へ開く Port の名前。 */
export const PAGE_SHORTCUT_PORT_NAME = "katip/page-shortcut"

/**
 * 有効にしたページ上のショートカットの一覧を置く `storage.local` のキー。値は `PageShortcut` の配列。
 *
 * @remarks
 * 注入したスクリプトはキーを押された瞬間に、ページの既定の動作を止めるかどうかを決める必要がある。
 * background に問い合わせる時間は無いので、設定から導いた一覧を background がここへ書き、
 * スクリプトが読んでおく。
 */
export const ENABLED_PAGE_SHORTCUTS_KEY = "katip/page-shortcuts/enabled"
