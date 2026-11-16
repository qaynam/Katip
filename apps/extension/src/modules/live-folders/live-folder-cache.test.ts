import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { BookmarkId } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { LiveFolderCache } from "./live-folder-cache"

const fetched = { items: [], lastAttempt: { _tag: "Fetched", at: 1 }, seenVersions: { a: 1 } }

const storedFolderIds = (records: Record<string, unknown>) =>
  Effect.gen(function* () {
    yield* (yield* FakeBrowser).seedStorage("local", { "katip/live-folders/records": records })
    const all = yield* LiveFolderCache.use((cache) => cache.all).pipe(
      Effect.provide(LiveFolderCache.layer),
    )
    return [...all.keys()]
  })

describe("records kept in storage", () => {
  it.effect(
    "drops only the record it can't read, such as one failed in a way this version doesn't know, keeping the other folders' records",
    () =>
      Effect.gen(function* () {
        const ids = yield* storedFolderIds({
          kept: fetched,
          unreadable: {
            ...fetched,
            lastAttempt: { _tag: "Failed", at: 1, failure: { _tag: "NoLongerKnown" } },
          },
        })

        assert.deepStrictEqual(ids, [BookmarkId.make("kept")])
      }).pipe(Effect.provide(FakeBrowser.layer)),
  )
})
