import { Match, Schema } from "effect"
import type { Translator } from "#modules/i18n"
import { signInUrlOf, type LiveSource } from "./live-source"

/** 取得元から項目を取り込めなかった理由。キャッシュに残し、次に取得できるまで表示する。 */
export const LiveFetchFailure = Schema.TaggedUnion({
  PermissionMissing: {},
  /** 取得元のサイトに、ブラウザでログインしていない（Gmail なら指定した番号のアカウント）。 */
  NotSignedIn: {},
  /** GitHub が、設定されたトークンを受け付けなかった（失効・取り消し・誤り）。 */
  TokenRejected: {},
  AccessDenied: { status: Schema.Int },
  /** `retryAt`（エポックミリ秒）まで、自動では取得し直さない。 */
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
  /** このページを開いてログインすれば直るなら、そのページ。 */
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

/** 失敗の理由を `translator` の言語で説明し、利用者が直せるならその手段を示す。 */
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
