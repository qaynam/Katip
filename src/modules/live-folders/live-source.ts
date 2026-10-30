import { Match, Schema } from "effect"

/** GitHub のライブフォルダに並べる対象。 */
export const GitHubQuery = Schema.Literals([
  "review-requested",
  "authored-pull-requests",
  "assigned-issues",
  "mentioned",
])
export type GitHubQuery = typeof GitHubQuery.Type

/** ライブフォルダの取得元。 */
export const LiveSource = Schema.TaggedUnion({
  /**
   * Gmail の未読。`accountIndex` はブラウザでログインしている Google アカウントの順番
   * （mail.google.com/mail/u/<n>/）。`label` が null なら受信トレイ。
   */
  Gmail: { accountIndex: Schema.Int, label: Schema.NullOr(Schema.String) },
  GitHub: { query: GitHubQuery },
})
export type LiveSource = typeof LiveSource.Type

/** ライブフォルダに並ぶ 1 件。取得元での識別子を id に持つ。 */
export const LiveItem = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  /** 差出人やリポジトリ名など、タイトルの下に小さく出す補足。 */
  subtitle: Schema.String,
  url: Schema.String,
  /** 取得元での最終更新時刻（エポックミリ秒）。 */
  updatedAt: Schema.Number,
})
export type LiveItem = typeof LiveItem.Type

export type GmailSource = Extract<LiveSource, { readonly _tag: "Gmail" }>

/**
 * 項目として開いてよい URL か。項目の URL はそのままタブで開くので、取得元の応答に
 * javascript: などが紛れ込んでも開かないよう、https だけを受け付ける。
 */
export const isOpenableUrl = (url: string): boolean => url.startsWith("https://")

/** 取得元へのアクセスに要るホストの許可。マニフェストの optional_host_permissions と同じ表記。 */
export const originPatternOf = (source: LiveSource): string =>
  Match.valueTags(source, {
    Gmail: () => "https://mail.google.com/*",
    GitHub: () => "https://api.github.com/*",
  })

const githubQueryTitles: Readonly<Record<GitHubQuery, string>> = {
  "review-requested": "GitHub のレビュー依頼",
  "authored-pull-requests": "GitHub の自分のプルリクエスト",
  "assigned-issues": "GitHub の担当 Issue",
  mentioned: "GitHub のメンション",
}

export const defaultLiveFolderTitle = (source: LiveSource): string =>
  Match.valueTags(source, {
    Gmail: ({ accountIndex, label }) => {
      const mailbox = label === null ? "Gmail の受信トレイ" : `Gmail の ${label}`
      return accountIndex === 0 ? mailbox : `${mailbox}（u/${accountIndex}）`
    },
    GitHub: ({ query }) => githubQueryTitles[query],
  })
