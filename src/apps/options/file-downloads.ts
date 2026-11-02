import { Context, Effect, Layer } from "effect"

export interface DownloadedFile {
  readonly name: string
  /** MIME タイプ。 */
  readonly type: string
  readonly content: string
}

export class FileDownloads extends Context.Service<
  FileDownloads,
  {
    /** ファイルをダウンロードさせる。保存先はブラウザのダウンロードの設定に従う。 */
    save(file: DownloadedFile): Effect.Effect<void>
  }
>()("katip/options/FileDownloads") {
  // chrome.downloads を使うと、そのためだけに downloads の権限を求めることになる。
  // ページのリンクからのダウンロードなら権限は要らない
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
          // クリックの直後に解放すると、ダウンロードが読み始める前に Blob が消えて失敗することがある
          setTimeout(() => URL.revokeObjectURL(url), 60_000)
        }),
    }),
  )
}
