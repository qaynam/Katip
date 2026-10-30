import {
  ENABLED_PAGE_SHORTCUTS_KEY,
  type KeyboardPlatform,
  PAGE_SHORTCUT_PORT_NAME,
  PAGE_SHORTCUTS,
  type PageShortcut,
  pageShortcutOf,
} from "#modules/page-shortcuts"
import type { PageShortcutClientMessage } from "#protocol"
import { showToast } from "./toast"

/** `chrome.runtime.Port` のうち、このスクリプトが使う部分。 */
export interface ExtensionPort {
  postMessage(message: unknown): void
  disconnect(): void
  readonly onMessage: { addListener(listener: (message: unknown) => void): void }
}

type StorageChanges = Readonly<Record<string, { readonly newValue?: unknown }>>

/** `chrome` のうち、このスクリプトが使う部分。 */
export interface ExtensionApi {
  readonly runtime: {
    /** 拡張機能を再読み込みした後に残った古いスクリプトでは undefined になる。 */
    readonly id?: string | undefined
    connect(connectInfo: { name: string }): ExtensionPort
  }
  readonly storage: {
    readonly local: {
      get(key: string): Promise<Readonly<Record<string, unknown>>>
      readonly onChanged: {
        addListener(listener: (changes: StorageChanges) => void): void
        removeListener(listener: (changes: StorageChanges) => void): void
      }
    }
  }
}

export interface PageShortcutEnvironment {
  readonly extension: ExtensionApi
  readonly window: Window
  readonly platform: KeyboardPlatform
}

export const keyboardPlatformOf = (navigatorPlatform: string): KeyboardPlatform =>
  navigatorPlatform.toLowerCase().startsWith("mac") ? "mac" : "other"

const isPageShortcut = (value: unknown): value is PageShortcut =>
  PAGE_SHORTCUTS.some((shortcut) => shortcut === value)

const enabledFrom = (stored: unknown): ReadonlySet<PageShortcut> =>
  new Set(Array.isArray(stored) ? stored.filter(isPageShortcut) : [])

// effect の Schema で decode しないのは、すべてのページで effect ごと読み込ませないため
const replyTextOf = (message: unknown): string | null => {
  if (typeof message !== "object" || message === null || !("_tag" in message)) return null
  if (message._tag === "Done" && "notice" in message && typeof message.notice === "string") {
    return message.notice
  }
  if (message._tag === "Failed" && "reason" in message && typeof message.reason === "string") {
    return message.reason
  }
  return null
}

// 二重に注入されたとき（読み込み中のタブへ注入した場合や、拡張機能を更新した後）に、
// 同じキーで 2 回コピーしないよう、最後に入ったものだけを動かす
const CURRENT_INSTANCE = Symbol.for("katip/page-shortcuts/current-instance")

/**
 * 有効なショートカットのキーを、ページより先に受け取って background へ送り、返事をページに表示する。
 * 返り値の関数を呼ぶと受け取るのをやめる。
 *
 * @remarks
 * 有効な一覧は storage から読み、変わるたびに読み直す。読み終えるまでは何も受け取らない。
 * 拡張機能を再読み込みして接続できなくなっていたら、キーを横取りせずに自分を外す。
 */
export const installPageShortcuts = ({
  extension,
  window,
  platform,
}: PageShortcutEnvironment): (() => void) => {
  const instance = {}
  Reflect.set(window, CURRENT_INSTANCE, instance)
  let enabled: ReadonlySet<PageShortcut> = new Set()
  let hasSeenChange = false

  const isCurrent = () => Reflect.get(window, CURRENT_INSTANCE) === instance

  const isExtensionAlive = () => {
    try {
      return extension.runtime.id !== undefined
    } catch {
      return false
    }
  }

  const onStorageChanged = (changes: StorageChanges) => {
    const change = changes[ENABLED_PAGE_SHORTCUTS_KEY]
    if (change === undefined) return
    hasSeenChange = true
    enabled = enabledFrom(change.newValue)
  }

  const send = (shortcut: PageShortcut) => {
    const port = extension.runtime.connect({ name: PAGE_SHORTCUT_PORT_NAME })
    port.onMessage.addListener((message) => {
      const text = replyTextOf(message)
      if (text !== null) showToast(window.document, text)
      port.disconnect()
    })
    const request: PageShortcutClientMessage = { _tag: "Run", shortcut }
    port.postMessage(request)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!isCurrent()) return
    if (!isExtensionAlive()) {
      uninstall()
      return
    }
    if (event.repeat || event.isComposing) return
    const shortcut = pageShortcutOf(event, platform)
    if (shortcut === null || !enabled.has(shortcut)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    try {
      send(shortcut)
    } catch {
      uninstall()
    }
  }

  const uninstall = () => {
    window.removeEventListener("keydown", onKeyDown, { capture: true })
    try {
      extension.storage.local.onChanged.removeListener(onStorageChanged)
    } catch {
      // 拡張機能が無効になった後は外せないが、もう呼ばれることも無い
    }
  }

  window.addEventListener("keydown", onKeyDown, { capture: true })
  extension.storage.local.onChanged.addListener(onStorageChanged)
  extension.storage.local.get(ENABLED_PAGE_SHORTCUTS_KEY).then(
    (items) => {
      // 読み終えるより先に変更が届いていたら、そちらが新しい
      if (!hasSeenChange) enabled = enabledFrom(items[ENABLED_PAGE_SHORTCUTS_KEY])
    },
    () => uninstall(),
  )
  return uninstall
}
