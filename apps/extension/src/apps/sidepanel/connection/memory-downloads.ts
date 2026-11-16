import { Array, Order } from "effect"
import type { Download, DownloadId, DownloadProgress } from "../logic/downloads"
import type { Downloads, DownloadsAccess } from "./downloads"

/**
 * A fake that keeps its downloads in memory, answers permission requests without prompting, and
 * records the files asked to be opened and shown.
 */
export interface MemoryDownloads extends Downloads {
  readonly downloads: ReadonlyArray<Download>
  readonly requestCount: number
  readonly opened: ReadonlyArray<DownloadId>
  readonly shown: ReadonlyArray<DownloadId>
  /** Adds the download, or replaces the one with its ID, as if it had started or moved on. */
  readonly put: (download: Download) => void
}

export interface MemoryDownloadsOptions {
  readonly downloads?: ReadonlyArray<Download>
  /** NotAsked by default. */
  readonly access?: DownloadsAccess
  /** Whether a request is granted. Granted by default. */
  readonly decide?: () => boolean
  readonly fileManager?: Downloads["fileManager"]
  /** The icon each download's file has. None by default. */
  readonly fileIcon?: (download: Download) => string | null
}

const byStartedLast = Order.flip(
  Order.mapInput(Order.Number, (download: Download) => download.startedAt),
)

export const createMemoryDownloads = (options: MemoryDownloadsOptions = {}): MemoryDownloads => {
  const decide = options.decide ?? (() => true)
  let access = options.access ?? "NotAsked"
  let downloads = options.downloads ?? []
  let requestCount = 0
  const opened: Array<DownloadId> = []
  const shown: Array<DownloadId> = []
  const watchers = new Set<() => void>()

  const put = (download: Download) => {
    downloads = downloads.some((existing) => existing.id === download.id)
      ? downloads.map((existing) => (existing.id === download.id ? download : existing))
      : [...downloads, download]
    for (const notify of watchers) notify()
  }

  const moveOn = (id: DownloadId, next: (progress: DownloadProgress) => DownloadProgress) => {
    const download = downloads.find((existing) => existing.id === id)
    if (download !== undefined) put({ ...download, progress: next(download.progress) })
  }

  return {
    get downloads() {
      return downloads
    },
    get requestCount() {
      return requestCount
    },
    opened,
    shown,
    put,
    access: () => Promise.resolve(access),
    request: async () => {
      requestCount += 1
      if (access !== "Granted") access = decide() ? "Granted" : "Declined"
      return access === "Granted"
    },
    watchRecent: (count, listener) => {
      if (access !== "Granted") return () => {}
      const notify = () => {
        const startedLast = new Set(Array.sort(downloads, byStartedLast).slice(0, count))
        listener(downloads.filter((download) => startedLast.has(download)))
      }
      watchers.add(notify)
      notify()
      return () => watchers.delete(notify)
    },
    fileIcon: (id) => {
      const download = downloads.find((existing) => existing.id === id)
      return Promise.resolve(download === undefined ? null : (options.fileIcon?.(download) ?? null))
    },
    open: (id) => {
      opened.push(id)
    },
    show: (id) => {
      shown.push(id)
    },
    pause: (id) =>
      moveOn(id, (progress) =>
        progress._tag === "InProgress"
          ? { ...progress, _tag: "Paused", canResume: true }
          : progress,
      ),
    resume: (id) =>
      moveOn(id, (progress) =>
        progress._tag === "Paused"
          ? {
              _tag: "InProgress",
              receivedBytes: progress.receivedBytes,
              totalBytes: progress.totalBytes,
            }
          : progress,
      ),
    cancel: (id) =>
      moveOn(id, (progress) =>
        progress._tag === "InProgress" || progress._tag === "Paused"
          ? { _tag: "Canceled" }
          : progress,
      ),
    fileManager: options.fileManager ?? "Folder",
  }
}
