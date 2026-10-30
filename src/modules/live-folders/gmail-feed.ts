import { Array, DateTime, Option, pipe, Result, Schema } from "effect"
import { XMLParser } from "fast-xml-parser"
import type { HttpRequest, HttpResponse } from "#platform/http"
import type { LiveFetchFailure } from "./live-fetch-failure"
import { isOpenableUrl, type GmailSource, type LiveItem } from "./live-source"

const mailboxUrl = (accountIndex: number) => `https://mail.google.com/mail/u/${accountIndex}/`

/**
 * ログイン中のセッションの cookie で読む未読フィード。
 *
 * Google の OAuth はスコープの審査が重く、拡張だけでは Gmail API を使えないため、
 * ブラウザでログインしている状態をそのまま使えるこのフィードを読む。
 */
export const gmailFeedRequest = ({ accountIndex, label }: GmailSource): HttpRequest => ({
  url: `${mailboxUrl(accountIndex)}feed/atom${label === null ? "" : `/${encodeURIComponent(label)}`}`,
  credentials: "include",
  // ログインしていないとログイン画面へリダイレクトされる。たどると許可の無い
  // accounts.google.com への要求になって接続エラーと区別できなくなるので、たどらずに判定する
  redirect: "manual",
})

const feedParser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: (_name, jPath) => jPath !== "feed.entry.link",
  parseTagValue: false,
  parseAttributeValue: false,
  // 既定では XML の文字参照（&#39; など）が解かれない。Gmail は件名や差出人の記号を文字参照で送る
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
        title: Option.getOrElse(nonBlank(entry.title), () => "（件名なし）"),
        subtitle: senderOf(entry),
        url: Option.getOrElse(conversationUrlOf(entry), () => mailboxUrl(accountIndex)),
        updatedAt: DateTime.toEpochMillis(updated),
      }),
    )

const parseXml = Option.liftThrowable((xml: string): unknown => feedParser.parse(xml))

/**
 * Gmail の未読フィード（Atom 0.3）から項目を取り出す。並びはフィードの順のまま。
 *
 * フィードでなければ None。形の合わない項目や時刻の無い項目は、フィード全体を捨てずにその項目だけを除く。
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
