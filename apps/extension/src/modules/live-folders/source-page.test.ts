import { describe, expect, it } from "vitest"
import { GMAIL_IMPORTANT_LABEL, GMAIL_PRIMARY_LABEL, type LiveSource } from "./live-source"
import { sourcePageUrlOf } from "./source-page"

describe("sourcePageUrlOf", () => {
  it.each<[string, LiveSource, string]>([
    [
      "the inbox of the folder's Google account",
      { _tag: "Gmail", accountIndex: 1, label: null },
      "https://mail.google.com/mail/u/1/#inbox",
    ],
    [
      "the inbox, which opens on the Primary tab",
      { _tag: "Gmail", accountIndex: 0, label: GMAIL_PRIMARY_LABEL },
      "https://mail.google.com/mail/u/0/#inbox",
    ],
    [
      "the important mail",
      { _tag: "Gmail", accountIndex: 0, label: GMAIL_IMPORTANT_LABEL },
      "https://mail.google.com/mail/u/0/#imp",
    ],
    [
      "the label, with its name escaped",
      { _tag: "Gmail", accountIndex: 0, label: "Clients/A & B" },
      "https://mail.google.com/mail/u/0/#label/Clients%2FA%20%26%20B",
    ],
    [
      "the unread GitHub notifications",
      { _tag: "GitHub", query: "notifications" },
      "https://github.com/notifications?query=is%3Aunread",
    ],
    [
      "github.com's results for the folder's search",
      { _tag: "GitHub", query: "review-requested" },
      "https://github.com/search?q=is%3Aopen+is%3Apr+review-requested%3A%40me+archived%3Afalse+sort%3Aupdated-desc&type=pullrequests",
    ],
    [
      "github.com's results for the first of the folder's searches",
      { _tag: "GitHub", query: "mentioned" },
      "https://github.com/search?q=is%3Aopen+mentions%3A%40me+archived%3Afalse+sort%3Aupdated-desc&type=pullrequests",
    ],
  ])("opens %s", (_, source, url) => {
    expect(sourcePageUrlOf(source)).toBe(url)
  })
})
