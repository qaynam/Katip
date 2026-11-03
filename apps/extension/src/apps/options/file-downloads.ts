import { Context, Effect, Layer } from "effect"

export interface DownloadedFile {
  readonly name: string
  /** MIME type. */
  readonly type: string
  readonly content: string
}

export class FileDownloads extends Context.Service<
  FileDownloads,
  {
    /** Downloads the file to wherever the browser's download settings say. */
    save(file: DownloadedFile): Effect.Effect<void>
  }
>()("katip/options/FileDownloads") {
  // Not chrome.downloads: it would need the downloads permission just for this, while a download
  // from a link on the page needs none
  static readonly layer = Layer.succeed(
    FileDownloads,
    FileDownloads.of({
      save: (file) =>
        Effect.sync(() => {
          const url = URL.createObjectURL(new Blob([file.content], { type: file.type }))
          const link = document.createElement("a")
          link.href = url
          link.download = file.name
          link.click()
          // Not revoked right after the click: the Blob may be gone before the download reads it
          setTimeout(() => URL.revokeObjectURL(url), 60_000)
        }),
    }),
  )
}
