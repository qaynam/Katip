import { Option, Result } from "effect"
import { describe, expect, it } from "vitest"
import { httpResponse, redirectResponse } from "#platform/http"
import { gmailFeedRequest, gmailItemsFrom, parseGmailFeed } from "./gmail-feed"
import type { GmailSource } from "./live-source"

const inbox: GmailSource = { _tag: "Gmail", accountIndex: 0, label: null }

const feedOf = (entries: string, fullcount = 1) =>
  `<?xml version="1.0" encoding="UTF-8"?><feed version="0.3" xmlns="http://purl.org/atom/ns#"><title>Gmail - Inbox for taro.yamada@example.com</title><tagline>New messages in your Gmail Inbox</tagline><fullcount>${fullcount}</fullcount><link rel="alternate" href="https://mail.google.com/mail" type="text/html" /><modified>2026-10-30T09:12:44Z</modified>${entries}</feed>`

const entryOf = (fields: {
  readonly id?: string
  readonly title?: string
  readonly name?: string
  readonly email?: string
  readonly link?: string | null
  readonly modified?: string | null
  readonly issued?: string | null
}) => {
  const link =
    fields.link === null
      ? ""
      : `<link rel="alternate" href="${fields.link ?? "https://mail.google.com/mail?account_id=taro.yamada@example.com&amp;message_id=19a3c1f2e4b5d6a7&amp;view=conv&amp;extsrc=atom"}" type="text/html" />`
  const modified =
    fields.modified === null
      ? ""
      : `<modified>${fields.modified ?? "2026-10-30T09:10:01Z"}</modified>`
  const issued =
    fields.issued === null ? "" : `<issued>${fields.issued ?? "2026-10-30T09:10:01Z"}</issued>`
  return `<entry><title>${fields.title ?? "Weekly meeting notes"}</title><summary>Hi Taro, here are this week&#39;s meeting notes.</summary>${link}${modified}${issued}<id>${fields.id ?? "tag:gmail.google.com,2004:1847261839201746352"}</id><author><name>${fields.name ?? "Hanako Sato"}</name><email>${fields.email ?? "hanako.sato@example.co.jp"}</email></author></entry>`
}

const itemsOf = (xml: string) => Option.getOrThrow(parseGmailFeed(xml, 0))

describe("parsing the unread feed", () => {
  it("turns each unread mail into an item with its subject, sender, conversation link and update time", () => {
    const items = itemsOf(feedOf(entryOf({})))

    expect(items).toStrictEqual([
      {
        id: "tag:gmail.google.com,2004:1847261839201746352",
        title: "Weekly meeting notes",
        subtitle: "Hanako Sato",
        url: "https://mail.google.com/mail?account_id=taro.yamada@example.com&message_id=19a3c1f2e4b5d6a7&view=conv&extsrc=atom",
        updatedAt: Date.UTC(2026, 9, 30, 9, 10, 1),
      },
    ])
  })

  it("lists several mails in the feed's order", () => {
    const xml = feedOf(
      entryOf({ id: "tag:gmail.google.com,2004:2", title: "Newer" }) +
        entryOf({ id: "tag:gmail.google.com,2004:1", title: "Older" }),
      2,
    )

    expect(itemsOf(xml).map((item) => item.title)).toStrictEqual(["Newer", "Older"])
  })

  it("is empty when there is no unread mail", () => {
    expect(itemsOf(feedOf("", 0))).toStrictEqual([])
  })

  it("decodes character and entity references in the subject and sender", () => {
    const xml = feedOf(
      entryOf({ title: "Re: It&#39;s &quot;done&quot; &amp; merged", name: "O&#39;Brien" }),
    )

    expect(itemsOf(xml).map((item) => [item.title, item.subtitle])).toStrictEqual([
      [`Re: It's "done" & merged`, "O'Brien"],
    ])
  })

  it("keeps a subject made only of digits as a string", () => {
    expect(itemsOf(feedOf(entryOf({ title: "0042" })))[0]?.title).toBe("0042")
  })

  it("leaves a blank subject empty", () => {
    expect(itemsOf(feedOf(entryOf({ title: "  " })))[0]?.title).toBe("")
  })

  it("shows the sender's email address when the sender has no name", () => {
    expect(itemsOf(feedOf(entryOf({ name: "" })))[0]?.subtitle).toBe("hanako.sato@example.co.jp")
  })

  it("opens the account's inbox for a mail without a conversation link", () => {
    const items = Option.getOrThrow(parseGmailFeed(feedOf(entryOf({ link: null })), 2))

    expect(items[0]?.url).toBe("https://mail.google.com/mail/u/2/")
  })

  it("opens the account's inbox instead of a conversation link that isn't https", () => {
    const items = itemsOf(feedOf(entryOf({ link: "javascript:alert(1)" })))

    expect(items[0]?.url).toBe("https://mail.google.com/mail/u/0/")
  })

  it("uses the received time when there is no update time", () => {
    const xml = feedOf(entryOf({ modified: null, issued: "2026-10-29T23:00:00Z" }))

    expect(itemsOf(xml)[0]?.updatedAt).toBe(Date.UTC(2026, 9, 29, 23, 0, 0))
  })

  it("leaves out only the mails without a readable time, keeping the others", () => {
    const xml = feedOf(
      entryOf({ id: "a", modified: null, issued: null }) +
        entryOf({ id: "b", modified: "yesterday" }) +
        entryOf({ id: "c" }),
      3,
    )

    expect(itemsOf(xml).map((item) => item.id)).toStrictEqual(["c"])
  })

  it("can't read HTML such as the sign-in page as a feed", () => {
    const html = `<!DOCTYPE html><html><head><title>Gmail</title></head><body><form action="https://accounts.google.com/"></form></body></html>`

    expect(parseGmailFeed(html, 0)).toStrictEqual(Option.none())
  })

  it("can't read a body that isn't XML as a feed", () => {
    expect(parseGmailFeed("Service Unavailable", 0)).toStrictEqual(Option.none())
  })
})

describe("requesting the unread feed", () => {
  it("reads the inbox from the feed of the account's index, with the signed-in cookies", () => {
    expect(gmailFeedRequest(inbox)).toStrictEqual({
      url: "https://mail.google.com/mail/u/0/feed/atom",
      credentials: "include",
      redirect: "manual",
    })
  })

  it("with a label, reads that label's feed, percent-encoding a non-ASCII label and its slash", () => {
    const request = gmailFeedRequest({ _tag: "Gmail", accountIndex: 1, label: "仕事/重要" })

    expect(request.url).toBe(
      "https://mail.google.com/mail/u/1/feed/atom/%E4%BB%95%E4%BA%8B%2F%E9%87%8D%E8%A6%81",
    )
  })
})

describe("judging the unread feed's response", () => {
  it("takes in the items when a feed comes back", () => {
    const result = gmailItemsFrom(httpResponse(200, feedOf(entryOf({}))), inbox)

    expect(Result.map(result, (items) => items.length)).toStrictEqual(Result.succeed(1))
  })

  it("a redirect to the sign-in page means not signed in", () => {
    expect(gmailItemsFrom(redirectResponse, inbox)).toStrictEqual(
      Result.fail({ _tag: "NotSignedIn" }),
    )
  })

  it("a request for authentication means not signed in", () => {
    expect(gmailItemsFrom(httpResponse(401), inbox)).toStrictEqual(
      Result.fail({ _tag: "NotSignedIn" }),
    )
  })

  it("a refusal means access is denied", () => {
    expect(gmailItemsFrom(httpResponse(403), inbox)).toStrictEqual(
      Result.fail({ _tag: "AccessDenied", status: 403 }),
    )
  })

  it("any other error response fails with its status code", () => {
    expect(gmailItemsFrom(httpResponse(503, "Service Unavailable"), inbox)).toStrictEqual(
      Result.fail({ _tag: "UnexpectedStatus", status: 503 }),
    )
  })

  it("a successful response that isn't a feed is unreadable", () => {
    expect(gmailItemsFrom(httpResponse(200, "<html></html>"), inbox)).toStrictEqual(
      Result.fail({ _tag: "UnreadableResponse" }),
    )
  })
})
