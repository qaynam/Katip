import { Context, Deferred, Effect, Layer, Queue, Ref, Stream } from "effect"
import { BrowserApiError, type TabId } from "#platform/browser"
import type { PageSoundOrder, PageSoundReport } from "#protocol"
import { type PageReport, PageSound } from "../page-sound"

/**
 * For tests: plays the page scripts of tabs. A tab has one once Katip puts it there, or once the
 * test plays a page that got it from Chrome reporting.
 */
export class FakePageSound extends Context.Service<
  FakePageSound,
  {
    /** Plays the page script in the tab reporting, and resolves with the background's reply. */
    report(tabId: TabId, url: string, report: PageSoundReport): Effect.Effect<PageSoundOrder | null>
    /** The orders the page script in the tab was given, its first reply included, oldest first. */
    ordersTo(tabId: TabId): Effect.Effect<ReadonlyArray<PageSoundOrder>>
    /** The patterns Chrome is to put the page script into pages at. */
    readonly registered: Effect.Effect<ReadonlyArray<string>>
  }
>()("katip/background/testing/FakePageSound") {
  static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const reports = yield* Queue.unbounded<PageReport>()
      const orders = yield* Ref.make<ReadonlyMap<TabId, ReadonlyArray<PageSoundOrder>>>(new Map())
      const registered = yield* Ref.make<ReadonlyArray<string>>([])
      const record = (tabId: TabId, order: PageSoundOrder | null) =>
        Ref.update(orders, (all) =>
          new Map(all).set(tabId, [...(all.get(tabId) ?? []), ...(order === null ? [] : [order])]),
        )

      const report = Effect.fnUntraced(function* (
        tabId: TabId,
        url: string,
        sent: PageSoundReport,
      ) {
        const replied = yield* Deferred.make<PageSoundOrder | null>()
        yield* record(tabId, null)
        yield* Queue.offer(reports, {
          tabId,
          url,
          report: sent,
          reply: (order) => Deferred.doneUnsafe(replied, Effect.succeed(order)),
        })
        if (sent._tag !== "PageSoundStarted") return null
        const order = yield* Deferred.await(replied)
        yield* record(tabId, order)
        return order
      })

      // A page given the script starts by asking where its sound goes
      const reportStarted = (tabId: TabId) => report(tabId, "", { _tag: "PageSoundStarted" })

      const pageSound = PageSound.of({
        reports: Stream.fromQueue(reports),
        register: (patterns) => Ref.set(registered, patterns),
        inject: (tabId) => Effect.asVoid(Effect.forkDetach(reportStarted(tabId))),
        tell: (tabId, order) =>
          Effect.flatMap(Ref.get(orders), (all) =>
            all.has(tabId)
              ? record(tabId, order)
              : Effect.fail(
                  new BrowserApiError({
                    api: "tabs.sendMessage",
                    cause: "no page script in the tab",
                  }),
                ),
          ),
      })

      return Layer.mergeAll(
        Layer.succeed(PageSound, pageSound),
        Layer.succeed(
          FakePageSound,
          FakePageSound.of({
            report,
            ordersTo: (tabId) => Effect.map(Ref.get(orders), (all) => all.get(tabId) ?? []),
            registered: Ref.get(registered),
          }),
        ),
      )
    }),
  )
}
