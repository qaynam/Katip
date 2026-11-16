import { Array, Match } from "effect"
import { GITHUB_UNREAD_NOTIFICATIONS_URL } from "./github-notifications"
import { githubWebSearchesFor, githubWebSearchUrl } from "./github-web-search"
import {
  GMAIL_IMPORTANT_LABEL,
  GMAIL_PRIMARY_LABEL,
  gmailMailboxUrl,
  type GitHubQuery,
  type LiveSource,
} from "./live-source"

const gmailViewOf = (label: string | null): string => {
  // Not a category address like the other inbox tabs': the Primary tab has none, and the inbox
  // opens on it
  if (label === null || label === GMAIL_PRIMARY_LABEL) return "inbox"
  if (label === GMAIL_IMPORTANT_LABEL) return "imp"
  return `label/${encodeURIComponent(label)}`
}

const githubPageOf = (query: GitHubQuery): string => {
  if (query === "notifications") return GITHUB_UNREAD_NOTIFICATIONS_URL
  // Not every search of a folder that makes several: the search page shows one kind of result at
  // a time, and the other kinds are a click away on it
  return githubWebSearchUrl(Array.headNonEmpty(githubWebSearchesFor(query)))
}

/**
 * The page at the source that lists what a live folder lists, including what the folder's limit
 * leaves out: the Gmail mailbox, Primary tab, Important mail or label, GitHub's unread
 * notifications, or the results of the folder's GitHub search.
 */
export const sourcePageUrlOf = (source: LiveSource): string =>
  Match.valueTags(source, {
    Gmail: ({ accountIndex, label }) => `${gmailMailboxUrl(accountIndex)}#${gmailViewOf(label)}`,
    GitHub: ({ query }) => githubPageOf(query),
  })
