import { Effect, Layer, ManagedRuntime, Option } from "effect"
import { SettingsRepository } from "#modules/settings"
import { type Release, Updates } from "#modules/updates"
import { Storage } from "#platform/browser"
import { Http } from "#platform/http"

/** A newer release of Katip to tell about. Tests and the dev harness swap in a fake. */
export interface UpdateNotices {
  /**
   * Resolves with the release to tell about, or null when there's none, checking is turned off in
   * the settings, or GitHub can't be asked. Never rejects.
   */
  readonly pending: () => Promise<Release | null>
  /** Stops telling about `version` until the browser restarts. */
  readonly dismiss: (version: string) => void
}

/** Asks GitHub, once each browser session, for a release later than `installedVersion`. */
export const makeGitHubUpdateNotices = (installedVersion: string): UpdateNotices => {
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(Updates.layer(installedVersion), SettingsRepository.layer).pipe(
      Layer.provide(Layer.mergeAll(Http.layer, Storage.layer)),
    ),
  )
  return {
    pending: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const settings = yield* (yield* SettingsRepository).get
          if (!settings.checkForUpdates) return null
          return Option.getOrNull(yield* (yield* Updates).notice)
        }).pipe(Effect.catchCause(() => Effect.succeed(null))),
      ),
    dismiss: (version) => void runtime.runFork(Updates.use((updates) => updates.dismiss(version))),
  }
}
