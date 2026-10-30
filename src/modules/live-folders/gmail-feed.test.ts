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
  return `<entry><title>${fields.title ?? "週次ミーティングの議事録"}</title><summary>山田さん お疲れさまです。今週の議事録を共有します。</summary>${link}${modified}${issued}<id>${fields.id ?? "tag:gmail.google.com,2004:1847261839201746352"}</id><author><name>${fields.name ?? "佐藤 花子"}</name><email>${fields.email ?? "hanako.sato@example.co.jp"}</email></author></entry>`
}

const itemsOf = (xml: string) => Option.getOrThrow(parseGmailFeed(xml, 0))

describe("未読フィードの解析", () => {
  it("未読のメールが、件名・差出人・会話へのリンク・更新時刻を持つ項目になる", () => {
    const items = itemsOf(feedOf(entryOf({})))

    expect(items).toStrictEqual([
      {
        id: "tag:gmail.google.com,2004:1847261839201746352",
        title: "週次ミーティングの議事録",
        subtitle: "佐藤 花子",
        url: "https://mail.google.com/mail?account_id=taro.yamada@example.com&message_id=19a3c1f2e4b5d6a7&view=conv&extsrc=atom",
        updatedAt: Date.UTC(2026, 9, 30, 9, 10, 1),
      },
    ])
  })

  it("複数のメールはフィードの順に並ぶ", () => {
    const xml = feedOf(
      entryOf({ id: "tag:gmail.google.com,2004:2", title: "新しい方" }) +
        entryOf({ id: "tag:gmail.google.com,2004:1", title: "古い方" }),
      2,
    )

    expect(itemsOf(xml).map((item) => item.title)).toStrictEqual(["新しい方", "古い方"])
  })

  it("未読が無ければ空になる", () => {
    expect(itemsOf(feedOf("", 0))).toStrictEqual([])
  })

  it("件名や差出人の文字参照・実体参照は元の文字に戻る", () => {
    const xml = feedOf(
      entryOf({ title: "Re: It&#39;s &quot;done&quot; &amp; merged", name: "O&#39;Brien" }),
    )

    expect(itemsOf(xml).map((item) => [item.title, item.subtitle])).toStrictEqual([
      [`Re: It's "done" & merged`, "O'Brien"],
    ])
  })

  it("数字だけの件名も文字列のまま残る", () => {
    expect(itemsOf(feedOf(entryOf({ title: "0042" })))[0]?.title).toBe("0042")
  })

  it("件名が空なら件名なしと示す", () => {
    expect(itemsOf(feedOf(entryOf({ title: "  " })))[0]?.title).toBe("（件名なし）")
  })

  it("差出人の名前が無ければメールアドレスを示す", () => {
    expect(itemsOf(feedOf(entryOf({ name: "" })))[0]?.subtitle).toBe("hanako.sato@example.co.jp")
  })

  it("会話へのリンクが無いメールは、そのアカウントの受信トレイを開く", () => {
    const items = Option.getOrThrow(parseGmailFeed(feedOf(entryOf({ link: null })), 2))

    expect(items[0]?.url).toBe("https://mail.google.com/mail/u/2/")
  })

  it("会話へのリンクが https でなければ、開かずにアカウントの受信トレイを開く", () => {
    const items = itemsOf(feedOf(entryOf({ link: "javascript:alert(1)" })))

    expect(items[0]?.url).toBe("https://mail.google.com/mail/u/0/")
  })

  it("更新時刻が無ければ受信時刻を使う", () => {
    const xml = feedOf(entryOf({ modified: null, issued: "2026-10-29T23:00:00Z" }))

    expect(itemsOf(xml)[0]?.updatedAt).toBe(Date.UTC(2026, 9, 29, 23, 0, 0))
  })

  it("時刻の無いメールや時刻の読めないメールだけを除き、ほかのメールは残す", () => {
    const xml = feedOf(
      entryOf({ id: "a", modified: null, issued: null }) +
        entryOf({ id: "b", modified: "昨日" }) +
        entryOf({ id: "c" }),
      3,
    )

    expect(itemsOf(xml).map((item) => item.id)).toStrictEqual(["c"])
  })

  it("ログイン画面などの HTML はフィードとして読めない", () => {
    const html = `<!DOCTYPE html><html><head><title>Gmail</title></head><body><form action="https://accounts.google.com/"></form></body></html>`

    expect(parseGmailFeed(html, 0)).toStrictEqual(Option.none())
  })

  it("XML でない本文はフィードとして読めない", () => {
    expect(parseGmailFeed("Service Unavailable", 0)).toStrictEqual(Option.none())
  })
})

describe("未読フィードの要求", () => {
  it("受信トレイは、アカウントの番号のフィードをログイン中の cookie 付きで読む", () => {
    expect(gmailFeedRequest(inbox)).toStrictEqual({
      url: "https://mail.google.com/mail/u/0/feed/atom",
      credentials: "include",
      redirect: "manual",
    })
  })

  it("ラベルを指定すると、そのラベルのフィードを読む", () => {
    const request = gmailFeedRequest({ _tag: "Gmail", accountIndex: 1, label: "仕事/重要" })

    expect(request.url).toBe(
      "https://mail.google.com/mail/u/1/feed/atom/%E4%BB%95%E4%BA%8B%2F%E9%87%8D%E8%A6%81",
    )
  })
})

describe("未読フィードの応答の判定", () => {
  it("フィードが返れば、その項目が取り込まれる", () => {
    const result = gmailItemsFrom(httpResponse(200, feedOf(entryOf({}))), inbox)

    expect(Result.map(result, (items) => items.length)).toStrictEqual(Result.succeed(1))
  })

  it("ログイン画面へリダイレクトされたら、ログインしていないと判定する", () => {
    expect(gmailItemsFrom(redirectResponse, inbox)).toStrictEqual(
      Result.fail({ _tag: "NotSignedIn" }),
    )
  })

  it("認証を求められたら、ログインしていないと判定する", () => {
    expect(gmailItemsFrom(httpResponse(401), inbox)).toStrictEqual(
      Result.fail({ _tag: "NotSignedIn" }),
    )
  })

  it("拒否されたら、アクセスできないと判定する", () => {
    expect(gmailItemsFrom(httpResponse(403), inbox)).toStrictEqual(
      Result.fail({ _tag: "AccessDenied", status: 403 }),
    )
  })

  it("それ以外のエラー応答は、その状態コードで失敗する", () => {
    expect(gmailItemsFrom(httpResponse(503, "Service Unavailable"), inbox)).toStrictEqual(
      Result.fail({ _tag: "UnexpectedStatus", status: 503 }),
    )
  })

  it("成功の応答でもフィードでなければ、読み取れないと判定する", () => {
    expect(gmailItemsFrom(httpResponse(200, "<html></html>"), inbox)).toStrictEqual(
      Result.fail({ _tag: "UnreadableResponse" }),
    )
  })
})
