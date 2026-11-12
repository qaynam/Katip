import { Context, Effect, Layer } from "effect"
import type { Extent } from "./spotlight-position"

const outerSize = (): Extent => ({ width: window.outerWidth, height: window.outerHeight })

export class CurrentWindow extends Context.Service<
  CurrentWindow,
  {
    /** The size of the browser window this page shows in, its frame included, in CSS pixels. */
    readonly size: Effect.Effect<Extent>
  }
>()("katip/options/CurrentWindow") {
  static readonly layer = Layer.succeed(
    CurrentWindow,
    CurrentWindow.of({
      size: Effect.tryPromise(() => chrome.windows.getCurrent()).pipe(
        Effect.map(({ width, height }) =>
          width === undefined || height === undefined ? outerSize() : { width, height },
        ),
        Effect.orElseSucceed(outerSize),
      ),
    }),
  )

  /** A browser window of `size`, which never changes. */
  static readonly layerTest = (size: Extent) =>
    Layer.succeed(CurrentWindow, CurrentWindow.of({ size: Effect.succeed(size) }))
}
