import { describe, expect, it } from "@effect/vitest"
import { Array, Context, Effect, Layer, Option, Ref } from "effect"
import { SpaceId } from "#modules/space"
import {
  BrowserApiError,
  type TabGroupId,
  TabGroups,
  type TabId,
  Tabs,
  type WindowId,
} from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import type { DesiredGroup, GroupAppearance } from "./tab-group-sync-plan"
import { TabGroupSync } from "./tab-group-sync"

interface ChromeCall {
  readonly api: "tabs.group" | "tabs.ungroup" | "tabGroups.update"
  readonly tabIds?: ReadonlyArray<TabId>
  readonly groupId?: TabGroupId
}

class CallLog extends Context.Service<
  CallLog,
  {
    readonly calls: Ref.Ref<ReadonlyArray<ChromeCall>>
    /** Fails the next matching call, once. */
    failOnce(matches: (call: ChromeCall) => boolean): Effect.Effect<void>
    around<A>(
      call: ChromeCall,
      effect: Effect.Effect<A, BrowserApiError>,
    ): Effect.Effect<A, BrowserApiError>
  }
>()("test/tab-group-sync/CallLog") {
  static readonly layer = Layer.effect(
    CallLog,
    Effect.gen(function* () {
      const calls = yield* Ref.make<ReadonlyArray<ChromeCall>>([])
      const traps = yield* Ref.make<ReadonlyArray<(call: ChromeCall) => boolean>>([])
      return CallLog.of({
        calls,
        failOnce: (matches) => Ref.update(traps, Array.append(matches)),
        around: (call, effect) =>
          Effect.gen(function* () {
            yield* Ref.update(calls, Array.append(call))
            // Lets syncs run concurrently actually interleave midway
            yield* Effect.yieldNow
            const sprung = yield* Ref.modify(traps, (pending) => {
              const index = pending.findIndex((matches) => matches(call))
              return index < 0 ? [false, pending] : [true, Array.remove(pending, index)]
            })
            if (sprung) {
              return yield* new BrowserApiError({
                api: call.api,
                cause: new Error("Injected failure"),
              })
            }
            return yield* effect
          }),
      })
    }),
  )
}

const recordedBrowser = Layer.mergeAll(
  Layer.effect(
    Tabs,
    Effect.gen(function* () {
      const inner = yield* Tabs
      const log = yield* CallLog
      return Tabs.of({
        ...inner,
        group: (options) =>
          log.around(
            {
              api: "tabs.group",
              tabIds: options.tabIds,
              ...(options.groupId !== undefined && { groupId: options.groupId }),
            },
            inner.group(options),
          ),
        ungroup: (tabIds) => log.around({ api: "tabs.ungroup", tabIds }, inner.ungroup(tabIds)),
      })
    }),
  ),
  Layer.effect(
    TabGroups,
    Effect.gen(function* () {
      const inner = yield* TabGroups
      const log = yield* CallLog
      return TabGroups.of({
        ...inner,
        update: (groupId, options) =>
          log.around({ api: "tabGroups.update", groupId }, inner.update(groupId, options)),
      })
    }),
  ),
)

const recordedTabGroupSync = TabGroupSync.layer.pipe(Layer.provide(recordedBrowser))

const testBrowser = recordedTabGroupSync.pipe(
  Layer.provideMerge(Layer.mergeAll(FakeBrowser.layer, CallLog.layer)),
)

const seedWindowOf = <const Name extends string>(...names: [Name, ...Array<Name>]) =>
  Effect.gen(function* () {
    const seeded = yield* (yield* FakeBrowser).seedWindow({ tabs: Array.map(names, () => ({})) })
    return {
      windowId: seeded.windowId,
      tab: (name: Name): TabId => Array.getUnsafe(seeded.tabIds, names.indexOf(name)),
    }
  })

const space = (
  name: string,
  windowId: WindowId,
  tabIds: ReadonlyArray<TabId>,
  look: Partial<GroupAppearance> = {},
): DesiredGroup => ({
  title: name,
  color: "blue",
  collapsed: false,
  ...look,
  spaceId: SpaceId.make(name),
  windowId,
  tabIds,
})

const sync = (desired: ReadonlyArray<DesiredGroup>) =>
  Effect.gen(function* () {
    const service = yield* TabGroupSync
    return yield* service.sync(desired)
  })

const syncExpectingIncomplete = (desired: ReadonlyArray<DesiredGroup>) =>
  sync(desired).pipe(Effect.catchTag("BrowserApiError", Effect.die), Effect.flip)

const groupsInChrome = Effect.gen(function* () {
  const { tabs, groups } = yield* (yield* FakeBrowser).snapshot
  return groups.map((g) => ({
    windowId: g.windowId,
    title: Option.getOrElse(g.title, () => ""),
    color: g.color,
    collapsed: g.collapsed,
    tabIds: tabs.filter((t) => Option.contains(t.groupId, g.id)).map((t) => t.id),
  }))
})

const groupOfTab = (tabId: TabId) =>
  Effect.gen(function* () {
    const { tabs } = yield* (yield* FakeBrowser).snapshot
    return tabs.find((t) => t.id === tabId)?.groupId.pipe(Option.getOrUndefined)
  })

const callsDuring = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const { calls } = yield* CallLog
    yield* Ref.set(calls, [])
    yield* effect
    return yield* Ref.get(calls)
  })

const groupingOf = (tabId: TabId) => (call: ChromeCall) =>
  call.api === "tabs.group" && !!call.tabIds?.includes(tabId)

describe("TabGroupSync", () => {
  it.effect(
    "creates a group for each Space in its window, with the Space's name, color and collapsed state",
    () =>
      Effect.gen(function* () {
        const main = yield* seedWindowOf("mail", "docs", "recipe")
        const other = yield* seedWindowOf("wiki")

        yield* sync([
          space("Work", main.windowId, [main.tab("mail"), main.tab("docs")]),
          space("Home", main.windowId, [main.tab("recipe")], { color: "green", collapsed: true }),
          space("Work", other.windowId, [other.tab("wiki")]),
        ])

        expect(yield* groupsInChrome).toStrictEqual([
          {
            windowId: main.windowId,
            title: "Work",
            color: "blue",
            collapsed: false,
            tabIds: [main.tab("mail"), main.tab("docs")],
          },
          {
            windowId: main.windowId,
            title: "Home",
            color: "green",
            collapsed: true,
            tabIds: [main.tab("recipe")],
          },
          {
            windowId: other.windowId,
            title: "Work",
            color: "blue",
            collapsed: false,
            tabIds: [other.tab("wiki")],
          },
        ])
      }).pipe(Effect.provide(testBrowser)),
  )

  it.effect("syncing again right after a sync makes no change in Chrome", () =>
    Effect.gen(function* () {
      const { windowId, tab } = yield* seedWindowOf("mail", "docs", "recipe")
      const desired = [
        space("Work", windowId, [tab("mail"), tab("docs")]),
        space("Home", windowId, [tab("recipe")], { collapsed: true }),
      ]
      yield* sync(desired)

      const calls = yield* callsDuring(sync(desired))

      expect(calls).toStrictEqual([])
    }).pipe(Effect.provide(testBrowser)),
  )

  it.effect(
    "keeps using the groups it created before, realigning only their tabs and appearance",
    () =>
      Effect.gen(function* () {
        const { windowId, tab } = yield* seedWindowOf("mail", "recipe", "news")
        yield* sync([space("Work", windowId, [tab("mail"), tab("recipe"), tab("news")])])
        const groupBefore = yield* groupOfTab(tab("mail"))

        yield* sync([
          space("Work", windowId, [tab("mail")], { title: "Work (renamed)" }),
          space("Home", windowId, [tab("recipe")]),
        ])

        expect(yield* groupOfTab(tab("mail"))).toBe(groupBefore)
        expect(yield* groupsInChrome).toStrictEqual([
          {
            windowId,
            title: "Work (renamed)",
            color: "blue",
            collapsed: false,
            tabIds: [tab("mail")],
          },
          { windowId, title: "Home", color: "blue", collapsed: false, tabIds: [tab("recipe")] },
        ])
      }).pipe(Effect.provide(testBrowser)),
  )

  it.effect(
    "after the service is rebuilt, keeps using the previous groups from the saved projection",
    () =>
      Effect.gen(function* () {
        const { windowId, tab } = yield* seedWindowOf("mail", "docs")
        yield* sync([space("Work", windowId, [tab("mail")])])
        const restarted = yield* Effect.map(
          Layer.build(recordedTabGroupSync),
          Context.get(TabGroupSync),
        )

        const calls = yield* callsDuring(
          restarted.sync([space("Work", windowId, [tab("mail"), tab("docs")])]),
        )

        expect(calls).toStrictEqual([
          { api: "tabs.group", tabIds: [tab("docs")], groupId: yield* groupOfTab(tab("mail")) },
        ])
      }).pipe(Effect.provide(testBrowser)),
  )

  it.effect("returns the group used for each Space and window", () =>
    Effect.gen(function* () {
      const main = yield* seedWindowOf("mail")
      const other = yield* seedWindowOf("recipe")

      const projection = yield* sync([
        space("Work", main.windowId, [main.tab("mail")]),
        space("Home", other.windowId, [other.tab("recipe")]),
      ])

      expect(projection).toStrictEqual([
        {
          spaceId: "Work",
          windowId: main.windowId,
          groupId: yield* groupOfTab(main.tab("mail")),
        },
        {
          spaceId: "Home",
          windowId: other.windowId,
          groupId: yield* groupOfTab(other.tab("recipe")),
        },
      ])
    }).pipe(Effect.provide(testBrowser)),
  )

  it.effect("syncs as if nothing were remembered when the saved projection is broken", () =>
    Effect.gen(function* () {
      const { windowId, tab } = yield* seedWindowOf("mail")
      yield* (yield* FakeBrowser).seedStorage("session", {
        "katip/tab-group-sync/projection": { broken: "value" },
      })

      yield* sync([space("Work", windowId, [tab("mail")])])

      expect(yield* groupsInChrome).toStrictEqual([
        { windowId, title: "Work", color: "blue", collapsed: false, tabIds: [tab("mail")] },
      ])
    }).pipe(Effect.provide(testBrowser)),
  )

  it.effect("concurrent calls don't create two groups for the same Space", () =>
    Effect.gen(function* () {
      const { windowId, tab } = yield* seedWindowOf("mail", "docs")
      const desired = [space("Work", windowId, [tab("mail"), tab("docs")])]

      const calls = yield* callsDuring(
        Effect.all([sync(desired), sync(desired)], { concurrency: "unbounded" }),
      )

      const creations = calls.filter((c) => c.api === "tabs.group" && c.groupId === undefined)
      expect(creations).toHaveLength(1)
    }).pipe(Effect.provide(testBrowser)),
  )

  describe("when a Chrome call fails", () => {
    it.effect("carries on with the remaining operations and reports the failed ones together", () =>
      Effect.gen(function* () {
        const { windowId, tab } = yield* seedWindowOf("mail", "recipe")
        yield* (yield* CallLog).failOnce(groupingOf(tab("mail")))

        const error = yield* syncExpectingIncomplete([
          space("Work", windowId, [tab("mail")]),
          space("Home", windowId, [tab("recipe")]),
        ])

        expect(error.failures.map((f) => f.operation)).toStrictEqual([
          expect.objectContaining({ _tag: "CreateGroup", spaceId: "Work" }),
        ])
        expect(yield* groupsInChrome).toStrictEqual([
          expect.objectContaining({ title: "Home", tabIds: [tab("recipe")] }),
        ])
      }).pipe(Effect.provide(testBrowser)),
    )

    it.effect("the next sync retries only what failed", () =>
      Effect.gen(function* () {
        const { windowId, tab } = yield* seedWindowOf("mail", "recipe")
        yield* (yield* CallLog).failOnce(groupingOf(tab("mail")))
        const desired = [
          space("Work", windowId, [tab("mail")]),
          space("Home", windowId, [tab("recipe")]),
        ]
        yield* syncExpectingIncomplete(desired)

        const calls = yield* callsDuring(sync(desired))

        expect(calls).toStrictEqual([
          { api: "tabs.group", tabIds: [tab("mail")] },
          { api: "tabGroups.update", groupId: yield* groupOfTab(tab("mail")) },
        ])
      }).pipe(Effect.provide(testBrowser)),
    )

    it.effect("uses a created group in the next sync even when styling it failed", () =>
      Effect.gen(function* () {
        const { windowId, tab } = yield* seedWindowOf("mail")
        const desired = [space("Work", windowId, [tab("mail")])]
        yield* (yield* CallLog).failOnce((call) => call.api === "tabGroups.update")
        yield* syncExpectingIncomplete(desired)

        const calls = yield* callsDuring(sync(desired))

        expect(calls.map((c) => c.api)).toStrictEqual(["tabGroups.update"])
        expect(yield* groupsInChrome).toStrictEqual([
          { windowId, title: "Work", color: "blue", collapsed: false, tabIds: [tab("mail")] },
        ])
      }).pipe(Effect.provide(testBrowser)),
    )
  })
})
