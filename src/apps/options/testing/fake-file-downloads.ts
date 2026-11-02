import { Context, Effect, Layer, Ref } from "effect"
import { type DownloadedFile, FileDownloads } from "../file-downloads"

/**
 * テスト用。ダウンロードさせたファイルを記録する。
 * `FakeFileDownloads.layer` はこれと {@link FileDownloads} を、記録を共有させて提供する。
 */
export class FakeFileDownloads extends Context.Service<
  FakeFileDownloads,
  {
    /** ダウンロードさせた順に、ダウンロードさせたファイル。 */
    readonly saved: Effect.Effect<ReadonlyArray<DownloadedFile>>
  }
>()("katip/options/testing/FakeFileDownloads") {
  static readonly layer = Layer.effectContext(
    Effect.gen(function* () {
      const saved = yield* Ref.make<ReadonlyArray<DownloadedFile>>([])
      return Context.make(
        FileDownloads,
        FileDownloads.of({ save: (file) => Ref.update(saved, (all) => [...all, file]) }),
      ).pipe(Context.add(FakeFileDownloads, FakeFileDownloads.of({ saved: Ref.get(saved) })))
    }),
  )
}
