import { Clock, Context, Effect, Layer, Option, Schema } from "effect"
import { Storage } from "#platform/browser"
import { Http, type HttpResponse } from "#platform/http"
import { isLaterVersion, LATEST_RELEASE_API_URL, Release, releaseOfResponse } from "./release"

export type UpdateStatus =
  | { readonly _tag: "UpToDate"; readonly checkedAt: number }
  | { readonly _tag: "Available"; readonly release: Release; readonly checkedAt: number }

/** GitHub couldn't be reached, or its reply wasn't a release of Katip. */
export class UpdateCheckFailed extends Schema.TaggedError<UpdateCheckFailed>()(
  "UpdateCheckFailed",
  { reason: Schema.Literals(["Unreachable", "UnexpectedReply"]) },
) {}

/**
 * GitHub turned the check away because of how many requests came from the same network, which
 * other apps and people sharing that network count toward as well.
 */
export class UpdateCheckLimited extends Schema.TaggedError<UpdateCheckLimited>()(
  "UpdateCheckLimited",
  {
    /** When GitHub takes requests again, in milliseconds since the epoch. */
    until: Schema.Number,
  },
) {}

const secondsIn = (header: string | undefined): Option.Option<number> => {
  const seconds = Number(header)
  return header === undefined || !Number.isFinite(seconds) ? Option.none() : Option.some(seconds)
}

// The signals GitHub documents for its rate limits. A 403 without them is some other refusal
const limitLiftsAt = (response: HttpResponse, now: number): Option.Option<number> => {
  if (response.status !== 403 && response.status !== 429) return Option.none()
  const retryAfter = secondsIn(response.headers["retry-after"])
  if (Option.isSome(retryAfter)) return Option.some(now + retryAfter.value * 1000)
  return response.headers["x-ratelimit-remaining"] === "0"
    ? Option.map(secondsIn(response.headers["x-ratelimit-reset"]), (reset) => reset * 1000)
    : Option.none()
}

const LatestCheck = Schema.Struct({ release: Release, checkedAt: Schema.Number })
type LatestCheck = typeof LatestCheck.Type

// Session storage, so each browser session checks once and the answer is shared by every side panel
// and the settings page. The latest release is kept rather than whether it's newer, which is worked
// out against the version installed when read
const LATEST_CHECK_KEY = "katip/updates/latest-check"
const DISMISSED_VERSION_KEY = "katip/updates/dismissed-version"

export class Updates extends Context.Service<
  Updates,
  {
    /** Asks GitHub for the latest release now. */
    readonly check: Effect.Effect<UpdateStatus, UpdateCheckFailed | UpdateCheckLimited>
    /**
     * The release to tell about when the side panel opens: a later version than the one installed
     * that hasn't been dismissed. Asks GitHub only for the first time in a browser session.
     */
    readonly notice: Effect.Effect<Option.Option<Release>, UpdateCheckFailed | UpdateCheckLimited>
    /** Stops telling about `version` until the browser restarts. */
    readonly dismiss: (version: string) => Effect.Effect<void>
  }
>()("katip/modules/updates/Updates") {
  /** @param installedVersion - The version of the running Katip, as its manifest gives it. */
  static readonly layer = (installedVersion: string) =>
    Layer.effect(
      Updates,
      Effect.gen(function* () {
        const http = yield* Http
        const session = (yield* Storage).session

        const statusOf = ({ release, checkedAt }: LatestCheck): UpdateStatus =>
          isLaterVersion(release.version, installedVersion)
            ? { _tag: "Available", release, checkedAt }
            : { _tag: "UpToDate", checkedAt }

        const fetchLatest = Effect.gen(function* () {
          const response = yield* http
            .send({
              url: LATEST_RELEASE_API_URL,
              headers: { accept: "application/vnd.github+json" },
              credentials: "omit",
            })
            .pipe(Effect.mapError(() => new UpdateCheckFailed({ reason: "Unreachable" })))
          const checkedAt = yield* Clock.currentTimeMillis
          const limitLifts = limitLiftsAt(response, checkedAt)
          if (Option.isSome(limitLifts)) {
            return yield* new UpdateCheckLimited({ until: limitLifts.value })
          }
          const release = response.status === 200 ? releaseOfResponse(response.body) : Option.none()
          if (Option.isNone(release)) {
            return yield* new UpdateCheckFailed({ reason: "UnexpectedReply" })
          }
          const latest: LatestCheck = { release: release.value, checkedAt }
          // Not failing the check over it: the answer is already in hand, and the next side panel
          // opened only asks GitHub again
          yield* session
            .set(LATEST_CHECK_KEY, Schema.encodeSync(LatestCheck)(latest))
            .pipe(Effect.ignore)
          return latest
        })

        const keptLatest = session
          .getDecoded(LATEST_CHECK_KEY, LatestCheck)
          .pipe(Effect.orElseSucceed(Option.none<LatestCheck>))

        const dismissedVersion = session
          .getDecoded(DISMISSED_VERSION_KEY, Schema.String)
          .pipe(Effect.orElseSucceed(Option.none<string>))

        return Updates.of({
          check: Effect.map(fetchLatest, statusOf),
          notice: Effect.gen(function* () {
            const kept = yield* keptLatest
            const status = statusOf(Option.isSome(kept) ? kept.value : yield* fetchLatest)
            if (status._tag === "UpToDate") return Option.none()
            const dismissed = yield* dismissedVersion
            return Option.contains(dismissed, status.release.version)
              ? Option.none()
              : Option.some(status.release)
          }),
          dismiss: (version) => session.set(DISMISSED_VERSION_KEY, version).pipe(Effect.ignore),
        })
      }),
    )
}
