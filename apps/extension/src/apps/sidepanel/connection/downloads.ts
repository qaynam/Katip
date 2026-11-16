import { Effect, ManagedRuntime, Option, Schema } from "effect"
import { Storage } from "#platform/browser"
import { DownloadId, type Download, type DownloadProgress } from "../logic/downloads"

/** Whether downloads can be read, and if not, whether asking for that was refused. */
export type DownloadsAccess = "Granted" | "Declined" | "NotAsked"

/** The downloads the browser keeps a record of. Tests and the dev harness swap in a fake. */
export interface Downloads {
  /** Never rejects. */
  readonly access: () => Promise<DownloadsAccess>
  /**
   * Asks for permission to read and open downloads, and resolves with whether it was granted.
   * Resolves true without asking when already granted. A refusal is remembered, so `access`
   * resolves with Declined until permission is granted. Never rejects.
   * Chrome only prompts while it is handling a user gesture such as a click, so call this from
   * the gesture's handler before any await.
   */
  readonly request: () => Promise<boolean>
  /**
   * Delivers the `count` downloads started last, now and again whenever one changes, until the
   * returned function is called. Delivers nothing without permission.
   */
  readonly watchRecent: (
    count: number,
    listener: (downloads: ReadonlyArray<Download>) => void,
  ) => () => void
  /** Resolves with the image URL of the icon the system shows for the file, or null. */
  readonly fileIcon: (id: DownloadId) => Promise<string | null>
  /**
   * Opens a completed download's file in the app the system opens it with. Chrome only opens it
   * while it is handling a user gesture.
   */
  readonly open: (id: DownloadId) => void
  /** Shows the file in the system's file manager. */
  readonly show: (id: DownloadId) => void
  readonly pause: (id: DownloadId) => void
  readonly resume: (id: DownloadId) => void
  readonly cancel: (id: DownloadId) => void
  /** Where `show` shows files: Finder on macOS, a folder window elsewhere. */
  readonly fileManager: "Finder" | "Folder"
}

const fileNameOf = (path: string) => path.split(/[\\/]/).at(-1) ?? ""

const knownSize = (bytes: number) => (bytes > 0 ? bytes : null)

const progressOf = (item: chrome.downloads.DownloadItem): DownloadProgress => {
  switch (item.state) {
    case "complete":
      return item.exists
        ? { _tag: "Complete", bytes: knownSize(item.fileSize) ?? item.bytesReceived }
        : { _tag: "Deleted" }
    case "interrupted":
      return item.error === "USER_CANCELED"
        ? { _tag: "Canceled" }
        : { _tag: "Failed", canResume: item.canResume }
    case "in_progress":
      return item.paused
        ? {
            _tag: "Paused",
            receivedBytes: item.bytesReceived,
            totalBytes: knownSize(item.totalBytes),
            canResume: item.canResume,
          }
        : {
            _tag: "InProgress",
            receivedBytes: item.bytesReceived,
            totalBytes: knownSize(item.totalBytes),
          }
  }
}

export const downloadOf = (item: chrome.downloads.DownloadItem): Download => {
  const url = item.finalUrl || item.url
  return {
    id: DownloadId.make(item.id),
    // The name isn't known yet while Chrome is still deciding where to save the file
    fileName: fileNameOf(item.filename) || url,
    url,
    startedAt: Date.parse(item.startTime),
    progress: progressOf(item),
  }
}

const PERMISSIONS: chrome.permissions.Permissions = { permissions: ["downloads", "downloads.open"] }

const DECLINED_KEY = "katip/sidepanel/downloads-declined"

// Chrome fires onChanged for every change but the bytes received, so a running download is read
// again on this interval to move its progress
const PROGRESS_INTERVAL_MS = 1_000

const isRunning = (download: Download) => download.progress._tag === "InProgress"

// Its calls reject for a download that is gone, and Chrome before 123 returns nothing from open
const callDownloads = (call: (downloads: typeof chrome.downloads) => unknown) => {
  try {
    void Promise.resolve(call(chrome.downloads)).catch(() => {})
  } catch {
    // chrome.downloads is missing until the permission is granted
  }
}

/** Reads the downloads through chrome.downloads, remembering a refusal in local storage. */
export const makeChromeDownloads = (options: {
  readonly fileManager: Downloads["fileManager"]
}): Downloads => {
  const runtime = ManagedRuntime.make(Storage.layer)
  const rememberDeclined = (isDeclined: boolean) =>
    void runtime.runFork(
      Storage.use((storage) =>
        isDeclined ? storage.local.set(DECLINED_KEY, true) : storage.local.remove(DECLINED_KEY),
      ).pipe(Effect.ignore),
    )
  const wasDeclined = () =>
    runtime.runPromise(
      Storage.use((storage) => storage.local.getDecoded(DECLINED_KEY, Schema.Boolean)).pipe(
        Effect.map((declined) => Option.getOrElse(declined, () => false)),
        Effect.catchCause(() => Effect.succeed(false)),
      ),
    )

  return {
    access: async () => {
      const isGranted = await chrome.permissions.contains(PERMISSIONS).catch(() => false)
      if (isGranted) return "Granted"
      return (await wasDeclined()) ? "Declined" : "NotAsked"
    },
    request: async () => {
      const isGranted = await chrome.permissions.request(PERMISSIONS).catch(() => false)
      rememberDeclined(!isGranted)
      return isGranted
    },
    watchRecent: (count, listener) => {
      const downloads = chrome.downloads as typeof chrome.downloads | undefined
      if (downloads === undefined) return () => {}
      let isStopped = false
      let latestRead = 0
      let progressTimer: ReturnType<typeof setTimeout> | undefined
      const read = () => {
        clearTimeout(progressTimer)
        const thisRead = ++latestRead
        downloads.search({ orderBy: ["-startTime"], limit: count }).then(
          (items) => {
            if (isStopped || thisRead !== latestRead) return
            const recent = items.map(downloadOf)
            listener(recent)
            if (recent.some(isRunning)) progressTimer = setTimeout(read, PROGRESS_INTERVAL_MS)
          },
          () => {},
        )
      }
      downloads.onCreated.addListener(read)
      downloads.onChanged.addListener(read)
      downloads.onErased.addListener(read)
      read()
      return () => {
        isStopped = true
        clearTimeout(progressTimer)
        downloads.onCreated.removeListener(read)
        downloads.onChanged.removeListener(read)
        downloads.onErased.removeListener(read)
      }
    },
    fileIcon: async (id) => {
      try {
        return (await chrome.downloads.getFileIcon(id, { size: 32 })) ?? null
      } catch {
        return null
      }
    },
    open: (id) => callDownloads((downloads) => downloads.open(id)),
    show: (id) => callDownloads((downloads) => downloads.show(id)),
    pause: (id) => callDownloads((downloads) => downloads.pause(id)),
    resume: (id) => callDownloads((downloads) => downloads.resume(id)),
    cancel: (id) => callDownloads((downloads) => downloads.cancel(id)),
    fileManager: options.fileManager,
  }
}
