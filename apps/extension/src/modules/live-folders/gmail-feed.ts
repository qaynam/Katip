import { Array, DateTime, Option, pipe, Result, Schema } from "effect"
import { XMLParser } from "fast-xml-parser"
import type { HttpRequest, HttpResponse } from "#platform/http"
import type { LiveFetchFailure } from "./live-fetch-failure"
import {
  gmailMailboxUrl,
  isOpenableUrl,
  type GmailSource,
  type LiveItem,
  type LiveItemIcon,
} from "./live-source"

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
  // Not the browser's cache: a copy kept there would go on listing mail already read
  cache: "no-store",
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

// Not their icon: anyone can sign up at these, so it says nothing of who sent the mail
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "outlook.com",
  "outlook.jp",
  "hotmail.com",
  "hotmail.co.jp",
  "live.com",
  "live.jp",
  "msn.com",
  "yahoo.com",
  "yahoo.co.jp",
  "ymail.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "yandex.com",
  "yandex.ru",
  "mail.ru",
  "qq.com",
  "163.com",
  "126.com",
  "docomo.ne.jp",
  "ezweb.ne.jp",
  "au.com",
  "softbank.ne.jp",
  "i.softbank.jp",
])

// Not the sender's own host: mail often comes from one kept for sending, such as mail. or news.,
// while the browser saved the icon of the site people visit. Not a full public suffix list either:
// a two-letter country code under a short second level, as in co.jp, keeps three labels
const siteDomainOf = (domain: string): string => {
  const labels = domain.split(".")
  const [secondLevel, topLevel] = labels.slice(-2)
  const isCountrySecondLevel =
    labels.length > 2 &&
    /^[a-z]{2}$/.test(topLevel ?? "") &&
    /^(ac|co|com|ed|edu|go|gov|gr|lg|ne|net|or|org)$/.test(secondLevel ?? "")
  return labels.slice(isCountrySecondLevel ? -3 : -2).join(".")
}

/** The site whose icon stands for the sender. None for an address at a free mail service. */
export const senderIconOf = (email: string): Option.Option<LiveItemIcon> => {
  const domain = email.trim().toLowerCase().split("@")[1] ?? ""
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return Option.none()
  const site = siteDomainOf(domain)
  return FREE_MAIL_DOMAINS.has(domain) || FREE_MAIL_DOMAINS.has(site)
    ? Option.none()
    : Option.some({ _tag: "SiteFavicon", siteUrl: `https://${site}/` })
}

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
        ...Option.match(senderIconOf(entry.author?.email ?? ""), {
          onNone: () => ({}),
          onSome: (icon) => ({ icon }),
        }),
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

/**
 * Marks the items found among the important ones, by their ID at Gmail.
 *
 * @remarks
 * The unread feed tells nothing of importance, so the feed of Gmail's important label tells which
 * of a folder's mails are.
 */
export const markImportant = (
  items: ReadonlyArray<LiveItem>,
  important: ReadonlyArray<LiveItem>,
): ReadonlyArray<LiveItem> => {
  const importantIds = new Set(important.map((item) => item.id))
  return items.map((item) => (importantIds.has(item.id) ? { ...item, isImportant: true } : item))
}
