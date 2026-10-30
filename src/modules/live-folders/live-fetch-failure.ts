import { Match, Schema } from "effect"
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

export const explainFailure = (failure: LiveFetchFailure, source: LiveSource): FailureExplanation =>
  Match.valueTags(failure, {
    PermissionMissing: () =>
      explanation("取得元へのアクセスが許可されていません", { needsPermission: true }),
    NotSignedIn: () =>
      explanation(
        source._tag === "Gmail"
          ? "このアカウントで Gmail にログインしていません"
          : "GitHub にログインしていません",
        { signInUrl: signInUrlOf(source) },
      ),
    TokenRejected: () => explanation("GitHub のアクセストークンが無効です", { needsToken: true }),
    AccessDenied: () => explanation("取得元へのアクセスが拒否されました"),
    RateLimited: () =>
      explanation(`${siteNameOf(source)} の利用上限に達しました。しばらくしてから取得し直します`),
    Unreachable: () => explanation("取得元に接続できませんでした"),
    UnexpectedStatus: ({ status }) => explanation(`取得できませんでした（HTTP ${status}）`),
    UnreadableResponse: () => explanation(`${siteNameOf(source)} の応答を読み取れませんでした`),
  })
