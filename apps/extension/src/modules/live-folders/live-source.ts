import { Match, Schema } from "effect"
import type { MessageKey, Translator } from "#modules/i18n"

/**
 * What a GitHub live folder lists. `notifications` is the unread threads of the notifications inbox,
 * and the others are searches.
 */
export const GitHubQuery = Schema.Literals([
  "review-requested",
  "authored-pull-requests",
  "assigned-issues",
  "mentioned",
  "notifications",
])
export type GitHubQuery = typeof GitHubQuery.Type

export type GitHubSearchQuery = Exclude<GitHubQuery, "notifications">

/** Where a live folder fetches its items from. */
export const LiveSource = Schema.TaggedUnion({
  /**
   * Unread Gmail. `accountIndex` is the position of the Google account signed in to the browser
   * (mail.google.com/mail/u/<n>/). A null `label` means the whole inbox,
   * {@link GMAIL_PRIMARY_LABEL} its Primary tab and {@link GMAIL_IMPORTANT_LABEL} the important
   * mail.
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

/** A picture standing for a live item, in place of its source's icon. */
export const LiveItemIcon = Schema.TaggedUnion({
  /** The icon the browser saved for a site, such as the sender's. */
  SiteFavicon: { siteUrl: Schema.String },
  /** An image on the web, such as the avatar of a repository's owner. */
  Image: { url: Schema.String },
})
export type LiveItemIcon = typeof LiveItemIcon.Type

/** One item listed in a live folder. Its id is its identifier at the source. */
export const LiveItem = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  /** Supplementary text shown small under the title, such as the sender or repository name. */
  subtitle: Schema.String,
  url: Schema.String,
  /** When the item was last updated at the source (epoch milliseconds). */
  updatedAt: Schema.Number,
  /** None leaves an initial to stand for the item. */
  icon: Schema.optionalKey(LiveItemIcon),
  /** Marked important at the source, as Gmail marks mail. */
  isImportant: Schema.optionalKey(Schema.Boolean),
})
export type LiveItem = typeof LiveItem.Type

export type GmailSource = Extract<LiveSource, { readonly _tag: "Gmail" }>

/**
 * The label of the mail in Gmail's Primary tab: the inbox without what Gmail sorts into
 * Promotions, Social, Updates and Forums.
 */
// Gmail's own name for the category, which Google doesn't document; the unread feed takes it like
// a label of the user's own. Not a search such as category:primary, as the feed takes no search
export const GMAIL_PRIMARY_LABEL = "^sq_ig_i_personal"

/** The label of the mail Gmail marks important, by hand or by its own guess. */
// Not a documented name: Gmail's own, like the Primary tab's, so Gmail may change it unannounced
export const GMAIL_IMPORTANT_LABEL = "^io_im"

/**
 * Whether a URL may become an item. Item URLs are opened in a tab as they are, so only https is
 * accepted, keeping a javascript: URL or the like in a source's response from being opened.
 */
export const isOpenableUrl = (url: string): boolean => url.startsWith("https://")

/** The host permission for github.com, read with the signed-in session. */
export const GITHUB_WEB_ORIGIN = "https://github.com/*"

/** The host permission for GitHub's official API, read with a token. */
export const GITHUB_API_ORIGIN = "https://api.github.com/*"

/**
 * The host permission needed to access a source, written as in the manifest's
 * optional_host_permissions.
 *
 * For GitHub's notifications it's the official API, the only way to read them. For GitHub's
 * searches it's github.com, read with the signed-in session; it doesn't cover the official API
 * used for them when a token is set.
 */
export const originPatternOf = (source: LiveSource): string =>
  Match.valueTags(source, {
    Gmail: () => "https://mail.google.com/*",
    GitHub: ({ query }) => (query === "notifications" ? GITHUB_API_ORIGIN : GITHUB_WEB_ORIGIN),
  })

/** The avatar of a GitHub user or organization, such as a repository's owner. */
export const githubAvatarIcon = (owner: string): LiveItemIcon => ({
  _tag: "Image",
  url: `https://github.com/${encodeURIComponent(owner)}.png?size=40`,
})

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
  notifications: "background.liveFolder.title.notifications",
} as const satisfies Readonly<Record<GitHubQuery, MessageKey>>

const gmailMailboxTitle = (label: string | null, translator: Translator): string => {
  if (label === null) return translator.t("background.liveFolder.title.gmailInbox")
  if (label === GMAIL_PRIMARY_LABEL) return translator.t("background.liveFolder.title.gmailPrimary")
  if (label === GMAIL_IMPORTANT_LABEL) {
    return translator.t("background.liveFolder.title.gmailImportant")
  }
  return translator.t("background.liveFolder.title.gmailLabel", { label })
}

/** The name a live folder gets when created, in `translator`'s language. */
export const defaultLiveFolderTitle = (source: LiveSource, translator: Translator): string =>
  Match.valueTags(source, {
    Gmail: ({ accountIndex, label }) => {
      const mailbox = gmailMailboxTitle(label, translator)
      return accountIndex === 0
        ? mailbox
        : translator.t("background.liveFolder.title.otherAccount", {
            title: mailbox,
            account: accountIndex,
          })
    },
    GitHub: ({ query }) => translator.t(githubQueryTitles[query]),
  })
