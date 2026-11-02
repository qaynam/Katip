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
 * In development builds, lets the development page on localhost read the background's logs.
 *
 * Browser automation tools can't open the service worker's DevTools, so the logs are kept here
 * and sent back on `{ type: "katip/dev-log" }` through `runtime.onMessageExternal`. It's a
 * one-off message rather than a Port because the background serves Ports as side panel
 * subscriptions and disconnects those with names it doesn't know.
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
