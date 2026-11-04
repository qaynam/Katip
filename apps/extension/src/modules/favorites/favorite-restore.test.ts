import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { TabId } from "#platform/browser"
import { claimFavoriteRecord, takeFavoriteSnapshot } from "./favorite-restore"
import { FavoriteId } from "./favorites"

const mail = FavoriteId.make("mail")
const docs = FavoriteId.make("docs")

describe("takeFavoriteSnapshot", () => {
  it("records the page each Favorite's tab shows, leaving out other tabs and tabs without a URL", () => {
    const bindings = [
      { tabId: TabId.make(1), favoriteId: mail },
      { tabId: TabId.make(3), favoriteId: docs },
    ]

    expect(
      takeFavoriteSnapshot(bindings, [
        { tabId: TabId.make(1), url: "https://mail.example/inbox/42" },
        { tabId: TabId.make(2), url: "https://other.example/" },
        { tabId: TabId.make(3), url: "" },
      ]),
    ).toStrictEqual([{ url: "https://mail.example/inbox/42", favoriteId: mail }])
  })
})

describe("claimFavoriteRecord", () => {
  const queue = {
    records: [
      { url: "https://mail.example/", favoriteId: mail },
      { url: "https://mail.example/", favoriteId: docs },
    ],
    expiresAt: 100,
  }

  it("takes out the first record with the same URL whose Favorite is wanted", () => {
    expect(
      claimFavoriteRecord(queue, "https://mail.example/", 50, (favoriteId) => favoriteId !== mail),
    ).toStrictEqual(
      Option.some([
        docs,
        { ...queue, records: [{ url: "https://mail.example/", favoriteId: mail }] },
      ]),
    )
  })

  it("claims nothing once the queue has expired", () => {
    expect(claimFavoriteRecord(queue, "https://mail.example/", 101, () => true)).toStrictEqual(
      Option.none(),
    )
  })
})
