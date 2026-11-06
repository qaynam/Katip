import { Effect, ManagedRuntime, Option, Schema } from "effect"
import type { SpaceId } from "#modules/space"
import { Storage, type WindowId } from "#platform/browser"

/**
 * Where each Space's list was last scrolled to in each window. Kept outside the side panel's page,
 * which Chrome discards whenever the panel closes. Tests and the dev harness swap in a fake.
 */
export interface ScrollPositions {
  /** Resolves with null when nothing was saved or it can't be read. Never rejects. */
  readonly read: (windowId: WindowId, spaceId: SpaceId) => Promise<number | null>
  readonly save: (windowId: WindowId, spaceId: SpaceId, top: number) => void
}

const keyOf = (windowId: WindowId, spaceId: SpaceId) =>
  `katip/sidepanel/scroll-top/${windowId}/${spaceId}`

/** Keeps the positions in the extension's session storage, which the browser clears when it quits. */
export const makeSessionScrollPositions = (): ScrollPositions => {
  // Not local storage: windows get new IDs when the browser restarts, so positions saved under the
  // old IDs would never be read again
  const runtime = ManagedRuntime.make(Storage.layer)
  return {
    read: (windowId, spaceId) =>
      runtime.runPromise(
        Storage.use((storage) =>
          storage.session.getDecoded(keyOf(windowId, spaceId), Schema.Number),
        ).pipe(
          Effect.map(Option.getOrNull),
          Effect.catchCause(() => Effect.succeed(null)),
        ),
      ),
    save: (windowId, spaceId, top) =>
      void runtime.runFork(
        Storage.use((storage) => storage.session.set(keyOf(windowId, spaceId), top)).pipe(
          Effect.ignore,
        ),
      ),
  }
}
