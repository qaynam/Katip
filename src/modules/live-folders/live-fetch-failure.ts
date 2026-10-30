import { Match, Schema } from "effect"

/** 取得元から項目を取り込めなかった理由。キャッシュに残し、次に取得できるまで表示する。 */
export const LiveFetchFailure = Schema.TaggedUnion({
  PermissionMissing: {},
  /** Gmail で、指定した番号の Google アカウントにログインしていない。 */
  NotSignedIn: {},
  TokenMissing: {},
  /** GitHub がトークンを受け付けなかった（失効・取り消し・誤り）。 */
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
}

const explanation = (
  reason: string,
  fix: { readonly needsPermission?: boolean; readonly needsToken?: boolean } = {},
): FailureExplanation => ({
  reason,
  needsPermission: fix.needsPermission ?? false,
  needsToken: fix.needsToken ?? false,
})

export const explainFailure = (failure: LiveFetchFailure): FailureExplanation =>
  Match.valueTags(failure, {
    PermissionMissing: () =>
      explanation("取得元へのアクセスが許可されていません", { needsPermission: true }),
    NotSignedIn: () => explanation("このアカウントで Gmail にログインしていません"),
    TokenMissing: () =>
      explanation("GitHub のアクセストークンが設定されていません", { needsToken: true }),
    TokenRejected: () => explanation("GitHub のアクセストークンが無効です", { needsToken: true }),
    AccessDenied: () => explanation("取得元へのアクセスが拒否されました"),
    RateLimited: () => explanation("GitHub の利用上限に達しました。しばらくしてから取得し直します"),
    Unreachable: () => explanation("取得元に接続できませんでした"),
    UnexpectedStatus: ({ status }) => explanation(`取得できませんでした（HTTP ${status}）`),
    UnreadableResponse: () => explanation("取得元の応答を読み取れませんでした"),
  })
