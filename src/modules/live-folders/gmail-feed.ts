import { Array, DateTime, Option, pipe, Result, Schema } from "effect"
import { XMLParser } from "fast-xml-parser"
import type { HttpRequest, HttpResponse } from "#platform/http"
import type { LiveFetchFailure } from "./live-fetch-failure"
import { gmailMailboxUrl, isOpenableUrl, type GmailSource, type LiveItem } from "./live-source"

/**
 * The unread feed, read with the signed-in session's cookies.
 *
 * Not the Gmail API: Google's OAuth scope review is heavy, and an extension alone can't use the
 * API. This feed works with the browser's signed-in state as it is.
 */
export const gmailFeedRequest = ({ accountIndex, label }: GmailSource): HttpRequest => ({
  url: `${gmailMailboxUrl(accountIndex)}feed/atom${label === null ? "" : `/${encodeURIComponent(label)}`}`,
  credentials: "include",
  // Signed out, the feed redirects to the sign-in page. Following it would request
  // accounts.google.com, which has no permission, and become indistinguishable from a connection
  // error, so the redirect is judged without following it
  redirect: "manual",
})

const feedParser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: (_name, jPath) => jPath !== "feed.entry.link",
  parseTagValue: false,
  parseAttributeValue: false,
  // By default XML character references (such as &#39;) stay undecoded, and Gmail sends symbols in
  // subjects and senders as character references
  htmlEntities: true,
  isArray: (_name, jPath) => jPath === "feed.entry" || jPath === "feed.entry.link",
})

const AtomFeed = Schema.Struct({
  feed: Schema.Struct({ entry: Schema.optionalKey(Schema.Array(Schema.Unknown)) }),
})

const AtomEntry = Schema.Struct({
  id: Schema.String,
  title: Schema.optionalKey(Schema.String),
  link: Schema.optionalKey(
    Schema.Array(Schema.Struct({ href: Schema.String, rel: Schema.optionalKey(Schema.String) })),
  ),
  modified: Schema.optionalKey(Schema.DateTimeUtcFromString),
  issued: Schema.optionalKey(Schema.DateTimeUtcFromString),
  author: Schema.optionalKey(
    Schema.Struct({
      name: Schema.optionalKey(Schema.String),
      email: Schema.optionalKey(Schema.String),
    }),
  ),
})
type AtomEntry = typeof AtomEntry.Type

const decodeFeed = Schema.decodeUnknownOption(AtomFeed)
const decodeEntry = Schema.decodeUnknownOption(AtomEntry)

const nonBlank = (text: string | undefined): Option.Option<string> =>
  Option.liftPredicate(text?.trim() ?? "", (trimmed) => trimmed !== "")

const senderOf = (entry: AtomEntry): string =>
  pipe(
    nonBlank(entry.author?.name),
    Option.orElse(() => nonBlank(entry.author?.email)),
    Option.getOrElse(() => ""),
  )

const conversationUrlOf = (entry: AtomEntry): Option.Option<string> =>
  pipe(
    Option.fromUndefinedOr(entry.link),
    Option.flatMap((links) =>
      Option.orElse(
        Array.findFirst(links, (link) => link.rel === "alternate"),
        () => Array.head(links),
      ),
    ),
    Option.flatMap((link) => nonBlank(link.href)),
    Option.filter(isOpenableUrl),
  )

const itemFrom =
  (accountIndex: number) =>
  (entry: AtomEntry): Option.Option<LiveItem> =>
    Option.map(
      Option.orElse(Option.fromUndefinedOr(entry.modified), () =>
        Option.fromUndefinedOr(entry.issued),
      ),
      (updated) => ({
        id: entry.id,
        // A mail without a subject stays empty here; the view says "no subject" in its own language
        title: Option.getOrElse(nonBlank(entry.title), () => ""),
        subtitle: senderOf(entry),
        url: Option.getOrElse(conversationUrlOf(entry), () => gmailMailboxUrl(accountIndex)),
        updatedAt: DateTime.toEpochMillis(updated),
      }),
    )

const parseXml = Option.liftThrowable((xml: string): unknown => feedParser.parse(xml))

/**
 * Reads the items from Gmail's unread feed (Atom 0.3), in the feed's order.
 *
 * None if it isn't a feed. An entry of the wrong shape or without a time is left out on its own,
 * without discarding the whole feed.
 */
export const parseGmailFeed = (
  xml: string,
  accountIndex: number,
): Option.Option<ReadonlyArray<LiveItem>> =>
  pipe(
    parseXml(xml),
    Option.flatMap(decodeFeed),
    Option.map(({ feed }) =>
      Array.getSomes(
        (feed.entry ?? []).map((raw) => Option.flatMap(decodeEntry(raw), itemFrom(accountIndex))),
      ),
    ),
  )

export const gmailItemsFrom = (
  response: HttpResponse,
  { accountIndex }: GmailSource,
): Result.Result<ReadonlyArray<LiveItem>, LiveFetchFailure> => {
  if (response.isRedirect || response.status === 401) {
    return Result.fail({ _tag: "NotSignedIn" })
  }
  if (response.status === 403) {
    return Result.fail({ _tag: "AccessDenied", status: response.status })
  }
  if (response.status !== 200) {
    return Result.fail({ _tag: "UnexpectedStatus", status: response.status })
  }
  return Result.fromOption(parseGmailFeed(response.body, accountIndex), () => ({
    _tag: "UnreadableResponse" as const,
  }))
}
