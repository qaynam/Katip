const MAX_ENTRIES = 300

interface Entry {
  readonly at: number
  readonly level: string
  readonly message: string
}

const describe = (value: unknown): string => {
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ""}`
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * 開発ビルドで、background のログを localhost の検証ページから取り出せるようにする。
 *
 * service worker の DevTools はブラウザ自動操作ツールから開けないため、ログを手元に溜め、
 * `runtime.onMessageExternal` で `{ type: "katip/dev-log" }` を受けたら返す。Port ではなく
 * 単発のメッセージにしているのは、Port はサイドパネル用の購読として background が受け持ち、
 * 知らない名前の接続を切ってしまうため。
 */
export const exposeLogsForDevelopment = () => {
  const entries: Array<Entry> = []
  const record = (level: string, args: ReadonlyArray<unknown>) => {
    entries.push({ at: Date.now(), level, message: args.map(describe).join(" ") })
    if (entries.length > MAX_ENTRIES) entries.shift()
  }
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: Array<unknown>) => {
      record(level, args)
      original(...args)
    }
  }
  self.addEventListener("error", (event) => record("uncaught", [event.error ?? event.message]))
  self.addEventListener("unhandledrejection", (event) => record("unhandled", [event.reason]))
  chrome.runtime.onMessageExternal.addListener((message: unknown, _sender, sendResponse) => {
    if ((message as { type?: unknown } | null)?.type !== "katip/dev-log") return undefined
    sendResponse(entries)
    return undefined
  })
}
