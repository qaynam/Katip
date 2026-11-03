import { Context, Effect, Layer, Ref } from "effect"
import { type DownloadedFile, FileDownloads } from "../file-downloads"

/**
 * For tests. Records the files downloaded. `FakeFileDownloads.layer` provides this and
 * {@link FileDownloads} sharing one record.
 */
export class FakeFileDownloads extends Context.Service<
  FakeFileDownloads,
  {
    /** The files downloaded, in the order they were downloaded. */
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
