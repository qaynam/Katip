import { Match, Schema } from "effect"
import type { MessageKey, Translator } from "#modules/i18n"

/** What a GitHub live folder lists. */
export const GitHubQuery = Schema.Literals([
  "review-requested",
  "authored-pull-requests",
  "assigned-issues",
  "mentioned",
])
export type GitHubQuery = typeof GitHubQuery.Type

/** Where a live folder fetches its items from. */
export const LiveSource = Schema.TaggedUnion({
  /**
   * Unread Gmail. `accountIndex` is the position of the Google account signed in to the browser
   * (mail.google.com/mail/u/<n>/). A null `label` means the inbox.
   */
  Gmail: { accountIndex: Schema.Int, label: Schema.NullOr(Schema.String) },
  GitHub: { query: GitHubQuery },
})
export type LiveSource = typeof LiveSource.Type

/**
 * How items in a live folder are ordered. `source` groups them by repository for GitHub and by
 * sender for Gmail.
 */
export const LiveSort = Schema.Literals(["newest", "oldest", "title", "source"])
export type LiveSort = typeof LiveSort.Type

/** One item listed in a live folder. Its id is its identifier at the source. */
export const LiveItem = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  /** Supplementary text shown small under the title, such as the sender or repository name. */
  subtitle: Schema.String,
  url: Schema.String,
  /** When the item was last updated at the source (epoch milliseconds). */
  updatedAt: Schema.Number,
})
export type LiveItem = typeof LiveItem.Type

export type GmailSource = Extract<LiveSource, { readonly _tag: "Gmail" }>

/**
 * Whether a URL may become an item. Item URLs are opened in a tab as they are, so only https is
 * accepted, keeping a javascript: URL or the like in a source's response from being opened.
 */
export const isOpenableUrl = (url: string): boolean => url.startsWith("https://")

/**
 * The host permission needed to access a source, written as in the manifest's
 * optional_host_permissions. Only needs the source's kind, so it works before the folder exists.
 *
 * For GitHub it's github.com, read with the signed-in session. It doesn't cover the official API
 * (api.github.com) used when a token is set.
 */
export const originPatternOfKind = (kind: LiveSource["_tag"]): string =>
  Match.value(kind).pipe(
    Match.when("Gmail", () => "https://mail.google.com/*"),
    Match.when("GitHub", () => "https://github.com/*"),
    Match.exhaustive,
  )

export const originPatternOf = (source: LiveSource): string => originPatternOfKind(source._tag)

export const gmailMailboxUrl = (accountIndex: number): string =>
  `https://mail.google.com/mail/u/${accountIndex}/`

/** The page to open to sign in when fetching fails because the user isn't signed in. */
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

/** The name a live folder gets when created, in `translator`'s language. */
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
