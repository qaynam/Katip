import { describe, expect, it } from "vitest"
import { Option, Schema } from "effect"
import { TabId } from "#platform/browser"
import {
  claimFavoriteRecord,
  FavoriteRestoreSnapshot,
  takeFavoriteSnapshot,
} from "./favorite-restore"
import { FavoriteId } from "./favorites"

const mail = FavoriteId.make("mail")
const docs = FavoriteId.make("docs")

describe("takeFavoriteSnapshot", () => {
  it("records the page each Favorite's tab shows and whether it is pinned, leaving out other tabs and tabs without a URL", () => {
    const bindings = [
      { tabId: TabId.make(1), favoriteId: mail },
      { tabId: TabId.make(3), favoriteId: docs },
      { tabId: TabId.make(4), favoriteId: docs },
    ]

    expect(
      takeFavoriteSnapshot(bindings, [
        { tabId: TabId.make(1), url: "https://mail.example/inbox/42", pinned: true },
        { tabId: TabId.make(2), url: "https://other.example/", pinned: false },
        { tabId: TabId.make(3), url: "", pinned: true },
        { tabId: TabId.make(4), url: "https://docs.example/", pinned: false },
      ]),
    ).toStrictEqual([
      { url: "https://mail.example/inbox/42", favoriteId: mail, isPinned: true },
      { url: "https://docs.example/", favoriteId: docs, isPinned: false },
    ])
  })
})

describe("a saved restore record", () => {
  it("saved before each Space had its own Favorites reads as one of a pinned tab", () => {
    expect(
      Schema.decodeUnknownSync(FavoriteRestoreSnapshot)([
        { url: "https://mail.example/", favoriteId: "mail" },
      ]),
    ).toStrictEqual([{ url: "https://mail.example/", favoriteId: mail, isPinned: true }])
  })
})

describe("claimFavoriteRecord", () => {
  const queue = {
    records: [
      { url: "https://mail.example/", favoriteId: mail, isPinned: true },
      { url: "https://mail.example/", favoriteId: docs, isPinned: true },
      { url: "https://docs.example/", favoriteId: docs, isPinned: false },
    ],
    expiresAt: 100,
  }
  const pinnedMail = { url: "https://mail.example/", isPinned: true }

  it("takes out the first record with the same URL whose Favorite is found", () => {
    expect(
      claimFavoriteRecord(queue, pinnedMail, 50, (favoriteId) =>
        Option.liftPredicate(favoriteId, (id) => id !== mail),
      ),
    ).toStrictEqual(
      Option.some([docs, { ...queue, records: [queue.records[0], queue.records[2]] }]),
    )
  })

  it("gives the tab the Favorite the record's Favorite resolves to", () => {
    const copy = FavoriteId.make("work/mail")

    expect(
      Option.map(
        claimFavoriteRecord(queue, pinnedMail, 50, () => Option.some(copy)),
        ([favoriteId]) => favoriteId,
      ),
    ).toStrictEqual(Option.some(copy))
  })

  it("leaves a record of a pinned tab to pinned tabs, and one of an unpinned tab to unpinned tabs", () => {
    const found = (url: string, isPinned: boolean) =>
      Option.map(
        claimFavoriteRecord(queue, { url, isPinned }, 50, Option.some),
        ([favoriteId]) => favoriteId,
      )

    expect([
      found("https://docs.example/", true),
      found("https://docs.example/", false),
      found("https://mail.example/", false),
    ]).toStrictEqual([Option.none(), Option.some(docs), Option.none()])
  })

  it("claims nothing once the queue has expired", () => {
    expect(claimFavoriteRecord(queue, pinnedMail, 101, Option.some)).toStrictEqual(Option.none())
  })
})
