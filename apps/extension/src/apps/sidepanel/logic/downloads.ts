import { Array, Match, Option, Order, Schema } from "effect"
import type { Translator } from "#modules/i18n"

export const DownloadId = Schema.Int.pipe(Schema.brand("DownloadId"))
export type DownloadId = typeof DownloadId.Type

/** How far a download got. A size is null when the server didn't tell it. */
export type DownloadProgress =
  | {
      readonly _tag: "InProgress"
      readonly receivedBytes: number
      readonly totalBytes: number | null
    }
  | {
      readonly _tag: "Paused"
      readonly receivedBytes: number
      readonly totalBytes: number | null
      readonly canResume: boolean
    }
  | { readonly _tag: "Complete"; readonly bytes: number }
  /** Completed, but the file is no longer where it was saved. */
  | { readonly _tag: "Deleted" }
  | { readonly _tag: "Canceled" }
  | { readonly _tag: "Failed"; readonly canResume: boolean }

export interface Download {
  readonly id: DownloadId
  readonly fileName: string
  /** Where the file was downloaded from. */
  readonly url: string
  /** The MIME type the server gave the file. Empty when it gave none. */
  readonly mime: string
  /** In milliseconds since the epoch. */
  readonly startedAt: number
  readonly progress: DownloadProgress
}

export const newestFirst = (downloads: ReadonlyArray<Download>): ReadonlyArray<Download> =>
  Array.sort(
    downloads,
    Order.flip(Order.mapInput(Order.Number, (download: Download) => download.startedAt)),
  )

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const

/**
 * A size in the largest unit it reaches, counting 1024 to the next unit as the browser's
 * downloads page does, such as "3.1 MB". The unit symbols are the same in every language.
 */
export const formatBytes = (bytes: number, languageTag: string): string => {
  const exponent = Math.min(
    Math.max(0, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024))),
    BYTE_UNITS.length - 1,
  )
  const value = bytes / 1024 ** exponent
  const fractionDigits = exponent === 0 || value >= 100 ? 0 : 1
  const number = new Intl.NumberFormat(languageTag, { maximumFractionDigits: fractionDigits })
  return `${number.format(value)} ${BYTE_UNITS[exponent]}`
}

/**
 * The host of the site the file came from. A blob: URL counts as the site that made it; a data:
 * URL has none.
 */
export const sourceHostOf = (url: string): Option.Option<string> =>
  Option.liftThrowable(() => new URL(new URL(url).origin).host)().pipe(
    Option.filter((host) => host !== ""),
  )

const receivedText = (receivedBytes: number, totalBytes: number | null, translator: Translator) => {
  const received = formatBytes(receivedBytes, translator.languageTag)
  return totalBytes === null
    ? received
    : translator.t("sidepanel.downloads.progress", {
        received,
        total: formatBytes(totalBytes, translator.languageTag),
      })
}

/**
 * A piece of what is said about a download. A state is a word for where the download stands, such
 * as Paused, and an alert one went wrong.
 */
export interface DownloadDetail {
  readonly text: string
  readonly tone: "Plain" | "State" | "Alert"
}

const plain = (text: string): DownloadDetail => ({ text, tone: "Plain" })
const state = (text: string): DownloadDetail => ({ text, tone: "State" })
const alert = (text: string): DownloadDetail => ({ text, tone: "Alert" })

/** What to say about how far the download got, as separate pieces shown side by side. */
export const progressDetails = (
  progress: DownloadProgress,
  translator: Translator,
): ReadonlyArray<DownloadDetail> =>
  Match.valueTags(progress, {
    InProgress: ({ receivedBytes, totalBytes }) => [
      plain(receivedText(receivedBytes, totalBytes, translator)),
    ],
    Paused: ({ receivedBytes, totalBytes }) => [
      state(translator.t("sidepanel.downloads.paused")),
      plain(receivedText(receivedBytes, totalBytes, translator)),
    ],
    Complete: ({ bytes }) => [plain(formatBytes(bytes, translator.languageTag))],
    Deleted: () => [state(translator.t("sidepanel.downloads.deleted"))],
    Canceled: () => [state(translator.t("sidepanel.downloads.canceled"))],
    Failed: () => [alert(translator.t("sidepanel.downloads.failed"))],
  })
