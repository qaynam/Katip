import { Match, Schema } from "effect"
import type { Translator } from "#modules/i18n"
import { signInUrlOf, type LiveSource } from "./live-source"

/**
 * Why items couldn't be taken in from a source. Kept in the cache and shown until a fetch succeeds.
 */
export const LiveFetchFailure = Schema.TaggedUnion({
  PermissionMissing: {},
  /** The browser isn't signed in to the source's site (for Gmail, as the account at the index). */
  NotSignedIn: {},
  /** GitHub didn't accept the configured token (expired, revoked or wrong). */
  TokenRejected: {},
  AccessDenied: { status: Schema.Int },
  /** No automatic refetch until `retryAt` (epoch milliseconds). */
  RateLimited: { retryAt: Schema.Number },
  Unreachable: {},
  UnexpectedStatus: { status: Schema.Int },
  UnreadableResponse: {},
})
export type LiveFetchFailure = typeof LiveFetchFailure.Type

export class LiveFetchError extends Schema.TaggedError<LiveFetchError>()("LiveFetchError", {
  failure: LiveFetchFailure,
}) {}

export interface FailureExplanation {
  readonly reason: string
  readonly needsPermission: boolean
  readonly needsToken: boolean
  /** The page to open and sign in on, when signing in there would fix the failure. */
  readonly signInUrl: string | null
}

const explanation = (
  reason: string,
  fix: Partial<Omit<FailureExplanation, "reason">> = {},
): FailureExplanation => ({
  reason,
  needsPermission: fix.needsPermission ?? false,
  needsToken: fix.needsToken ?? false,
  signInUrl: fix.signInUrl ?? null,
})

const siteNameOf = (source: LiveSource): string =>
  Match.valueTags(source, { Gmail: () => "Gmail", GitHub: () => "GitHub" })

/** Explains the failure in `translator`'s language and, when the user can fix it, how. */
export const explainFailure = (
  failure: LiveFetchFailure,
  source: LiveSource,
  translator: Translator,
): FailureExplanation =>
  Match.valueTags(failure, {
    PermissionMissing: () =>
      explanation(translator.t("background.liveFolder.permissionMissing"), {
        needsPermission: true,
      }),
    NotSignedIn: () =>
      explanation(
        translator.t(
          source._tag === "Gmail"
            ? "background.liveFolder.notSignedInGmail"
            : "background.liveFolder.notSignedInGitHub",
        ),
        { signInUrl: signInUrlOf(source) },
      ),
    TokenRejected: () =>
      explanation(translator.t("background.liveFolder.tokenRejected"), { needsToken: true }),
    AccessDenied: () => explanation(translator.t("background.liveFolder.accessDenied")),
    RateLimited: () =>
      explanation(translator.t("background.liveFolder.rateLimited", { site: siteNameOf(source) })),
    Unreachable: () => explanation(translator.t("background.liveFolder.unreachable")),
    UnexpectedStatus: ({ status }) =>
      explanation(translator.t("background.liveFolder.unexpectedStatus", { status })),
    UnreadableResponse: () =>
      explanation(translator.t("background.liveFolder.unreadable", { site: siteNameOf(source) })),
  })
