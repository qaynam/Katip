import { Match, Schema } from "effect"
import type { MessageKey, Translator } from "#modules/i18n"

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

/**
 * ライブフォルダの中の並べ方。`source` は GitHub ならリポジトリ、Gmail なら差出人でまとめる。
 */
export const LiveSort = Schema.Literals(["newest", "oldest", "title", "source"])
export type LiveSort = typeof LiveSort.Type

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

/**
 * 取得元へのアクセスに要るホストの許可。マニフェストの optional_host_permissions と同じ表記。
 *
 * GitHub はログイン中のセッションで読む github.com を返す。トークンが設定されているときに使う
 * 公式 API（api.github.com）の許可は含まない。
 */
/** 取得元へのアクセスの許可に使うパターン。作成前の、取得元の種類しか決まっていない時点でも引ける。 */
export const originPatternOfKind = (kind: LiveSource["_tag"]): string =>
  Match.value(kind).pipe(
    Match.when("Gmail", () => "https://mail.google.com/*"),
    Match.when("GitHub", () => "https://github.com/*"),
    Match.exhaustive,
  )

export const originPatternOf = (source: LiveSource): string => originPatternOfKind(source._tag)

export const gmailMailboxUrl = (accountIndex: number): string =>
  `https://mail.google.com/mail/u/${accountIndex}/`

/** ログインしていなくて取得できないときに、ログインのために開くページ。 */
export const signInUrlOf = (source: LiveSource): string =>
  Match.valueTags(source, {
    Gmail: ({ accountIndex }) => gmailMailboxUrl(accountIndex),
    GitHub: () => "https://github.com/login",
  })

const githubQueryTitles = {
  "review-requested": "background.liveFolder.title.reviewRequested",
  "authored-pull-requests": "background.liveFolder.title.authoredPullRequests",
  "assigned-issues": "background.liveFolder.title.assignedIssues",
  mentioned: "background.liveFolder.title.mentioned",
} as const satisfies Readonly<Record<GitHubQuery, MessageKey>>

/** 作ったときのライブフォルダの名前。`translator` の言語で付ける。 */
export const defaultLiveFolderTitle = (source: LiveSource, translator: Translator): string =>
  Match.valueTags(source, {
    Gmail: ({ accountIndex, label }) => {
      const mailbox =
        label === null
          ? translator.t("background.liveFolder.title.gmailInbox")
          : translator.t("background.liveFolder.title.gmailLabel", { label })
      return accountIndex === 0
        ? mailbox
        : translator.t("background.liveFolder.title.otherAccount", {
            title: mailbox,
            account: accountIndex,
          })
    },
    GitHub: ({ query }) => translator.t(githubQueryTitles[query]),
  })
