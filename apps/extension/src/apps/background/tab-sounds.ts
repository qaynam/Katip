import { Array, Context, Effect, Layer, Option, PubSub, Ref, Semaphore, Stream } from "effect"
import {
  originPatternOfSite,
  ruleForSite,
  type SoundRules,
  SoundSettings,
  type SoundSite,
  soundSiteOf,
  withoutRule,
  withRule,
} from "#modules/sound"
import { type BrowserApiError, type BrowserTab, type TabId, Tabs } from "#platform/browser"
import { Permissions } from "#platform/permissions"
import type { PageSoundStatus, TabSoundView } from "#protocol"
import { type PageReport, PageSound } from "./page-sound"
import { urlOf } from "./tab-admission"

interface Choice {
  readonly site: SoundSite
  readonly output: string | null
  readonly scope: TabSoundView["scope"]
}

interface TabOnlyChoice {
  readonly site: SoundSite
  readonly output: string | null
}

interface State {
  /** The tabs whose sound Katip sends to an output, and how far it got. */
  readonly tabs: ReadonlyMap<TabId, TabSoundView & { readonly site: SoundSite }>
  /** Outputs chosen for one tab only, kept while the tab stays on that site. */
  readonly tabOnly: ReadonlyMap<TabId, TabOnlyChoice>
}

const stateOfStatus = (status: PageSoundStatus): TabSoundView["state"] => status._tag

const choiceFor = (
  tabId: TabId,
  site: SoundSite,
  rules: SoundRules,
  tabOnly: State["tabOnly"],
): Option.Option<Choice> => {
  const forTab = tabOnly.get(tabId)
  if (forTab !== undefined && forTab.site === site) {
    return Option.some({ site, output: forTab.output, scope: "Tab" })
  }
  return Option.map(
    Option.filter(ruleForSite(rules, site), (rule) => rule.method === "InPage"),
    (rule) => ({ site, output: rule.output, scope: "Site" }),
  )
}

const without = <K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> => {
  const copy = new Map(map)
  copy.delete(key)
  return copy
}

const makeTabSounds = Effect.gen(function* () {
  const settings = yield* SoundSettings
  const pageSound = yield* PageSound
  const permissions = yield* Permissions
  const tabs = yield* Tabs
  const state = yield* Ref.make<State>({ tabs: new Map(), tabOnly: new Map() })
  const changed = yield* PubSub.unbounded<undefined>()
  // A report, a sync and a choice all read and write the state; interleaved, one would undo another
  const lock = yield* Semaphore.make(1)
  const serialized = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Semaphore.withPermits(lock, 1)(effect)
  const notify = PubSub.publish(changed, undefined)

  const setTab = (tabId: TabId, view: (TabSoundView & { readonly site: SoundSite }) | null) =>
    Ref.update(state, (current) => ({
      ...current,
      tabs: view === null ? without(current.tabs, tabId) : new Map(current.tabs).set(tabId, view),
    }))

  // Told to the page script when the page has one, otherwise given to the page, which then asks
  const deliver = (tabId: TabId, choice: Choice) =>
    pageSound
      .tell(tabId, { _tag: "PlayOn", output: choice.output })
      .pipe(Effect.catch(() => pageSound.inject(tabId)))

  const hasAccess = (site: SoundSite) =>
    permissions.containsOrigin(originPatternOfSite(site)).pipe(Effect.orElseSucceed(() => false))

  const syncTab = Effect.fnUntraced(function* (
    tab: BrowserTab,
    rules: SoundRules,
    accessible: ReadonlySet<SoundSite>,
  ) {
    const site = soundSiteOf(urlOf(tab))
    const current = yield* Ref.get(state)
    const shown = current.tabs.get(tab.id)
    const choice = Option.flatMap(site, (s) => choiceFor(tab.id, s, rules, current.tabOnly))
    if (Option.isNone(choice)) {
      if (shown === undefined) return
      yield* Effect.ignore(pageSound.tell(tab.id, { _tag: "LetGo" }))
      yield* setTab(tab.id, null)
      return
    }
    const { value } = choice
    if (!accessible.has(value.site)) {
      yield* setTab(tab.id, { ...value, state: "NeedsAccess" })
      return
    }
    const isUnchanged =
      shown !== undefined &&
      shown.state !== "NeedsAccess" &&
      shown.output === value.output &&
      shown.scope === value.scope
    if (isUnchanged) return
    yield* setTab(tab.id, { ...value, state: "Pending" })
    yield* Effect.ignore(deliver(tab.id, value))
  })

  const syncUnlocked = Effect.gen(function* () {
    const rules = yield* settings.get
    const { tabOnly } = yield* Ref.get(state)
    const sites = Array.dedupe([
      ...rules.filter((rule) => rule.method === "InPage").map((rule) => rule.site),
      ...[...tabOnly.values()].map((choice) => choice.site),
    ])
    const accessible = new Set(yield* Effect.filter(sites, hasAccess))
    // Only sites kept for good: a page of a site chosen for one tab is given the script by hand
    yield* pageSound.register(
      rules
        .filter((rule) => rule.method === "InPage" && accessible.has(rule.site))
        .map((rule) => originPatternOfSite(rule.site)),
    )
    for (const tab of yield* tabs.query({})) yield* syncTab(tab, rules, accessible)
    yield* notify
  })

  /**
   * Brings every open tab in line with the saved settings and the outputs chosen for single tabs,
   * and makes Chrome give the page script to the pages the sites load from now on.
   */
  const sync: Effect.Effect<void, BrowserApiError> = serialized(syncUnlocked)

  const tabUrl = (tabId: TabId, fallback: string) =>
    tabs.get(tabId).pipe(
      Effect.map(urlOf),
      Effect.orElseSucceed(() => fallback),
    )

  /** Answers a page asking where its sound goes, and keeps what pages say about where it went. */
  const handle = (incoming: PageReport) =>
    serialized(
      Effect.gen(function* () {
        const site = soundSiteOf(yield* tabUrl(incoming.tabId, incoming.url))
        const current = yield* Ref.get(state)
        const report = incoming.report
        if (report._tag === "PageSoundStarted") {
          const rules = yield* settings.get.pipe(Effect.orElseSucceed((): SoundRules => []))
          const choice = Option.flatMap(site, (s) =>
            choiceFor(incoming.tabId, s, rules, current.tabOnly),
          )
          incoming.reply(
            Option.match(choice, {
              onNone: () => null,
              onSome: ({ output }) => ({ _tag: "PlayOn", output }),
            }),
          )
          yield* setTab(
            incoming.tabId,
            Option.match(choice, {
              onNone: () => null,
              onSome: (chosen) => ({ ...chosen, state: "Pending" }),
            }),
          )
        } else {
          yield* Effect.ignore(settings.noteOutputs(report.outputs))
          const shown = current.tabs.get(incoming.tabId)
          if (shown === undefined || !Option.contains(site, shown.site)) return
          yield* setTab(incoming.tabId, {
            ...shown,
            output: report.status._tag === "NeedsMicrophone" ? shown.output : report.status.output,
            state: stateOfStatus(report.status),
          })
        }
        yield* notify
      }),
    )

  /** Sends the tab's sound to `output`, for the tab's site or for this tab only. */
  const choose = (tabId: TabId, output: string | null, scope: TabSoundView["scope"]) =>
    serialized(
      Effect.gen(function* () {
        const site = soundSiteOf(urlOf(yield* tabs.get(tabId)))
        if (Option.isNone(site)) return
        if (scope === "Site") {
          yield* Ref.update(state, (current) => ({
            ...current,
            tabOnly: without(current.tabOnly, tabId),
          }))
          yield* settings.update((rules) =>
            withRule(rules, { site: site.value, output, volume: 1, method: "InPage" }),
          )
        } else {
          yield* Ref.update(state, (current) => ({
            ...current,
            tabOnly: new Map(current.tabOnly).set(tabId, { site: site.value, output }),
          }))
        }
        yield* syncUnlocked
      }),
    )

  /** Leaves the tab's sound to the page, forgetting what was chosen for the tab and its site. */
  const reset = (tabId: TabId) =>
    serialized(
      Effect.gen(function* () {
        const site = soundSiteOf(urlOf(yield* tabs.get(tabId)))
        yield* Ref.update(state, (current) => ({
          ...current,
          tabOnly: without(current.tabOnly, tabId),
        }))
        if (Option.isSome(site)) yield* settings.update((rules) => withoutRule(rules, site.value))
        yield* syncUnlocked
      }),
    )

  /** Forgets a closed tab. */
  const forget = (tabId: TabId) =>
    serialized(
      Effect.andThen(
        Ref.update(state, (current) => ({
          tabs: without(current.tabs, tabId),
          tabOnly: without(current.tabOnly, tabId),
        })),
        notify,
      ),
    )

  /**
   * Forgets what was chosen for a tab that went to another site. A page of a site kept for good
   * asks again as it starts.
   */
  const followNavigation = (tab: BrowserTab) =>
    serialized(
      Effect.gen(function* () {
        const site = soundSiteOf(urlOf(tab))
        const current = yield* Ref.get(state)
        const left = (choice: { readonly site: SoundSite } | undefined) =>
          choice !== undefined && !Option.contains(site, choice.site)
        if (!left(current.tabs.get(tab.id)) && !left(current.tabOnly.get(tab.id))) return
        yield* Ref.set(state, {
          tabs: left(current.tabs.get(tab.id)) ? without(current.tabs, tab.id) : current.tabs,
          tabOnly: left(current.tabOnly.get(tab.id))
            ? without(current.tabOnly, tab.id)
            : current.tabOnly,
        })
        yield* notify
      }),
    )

  return TabSounds.of({
    sync,
    handle,
    choose,
    reset,
    forget,
    followNavigation,
    views: Effect.map(
      Ref.get(state),
      (current): ReadonlyMap<TabId, TabSoundView> =>
        new Map(
          [...current.tabs].map(([tabId, { output, scope, state: tabState }]) => [
            tabId,
            { output, scope, state: tabState },
          ]),
        ),
    ),
    changes: Stream.fromPubSub(changed),
  })
})

/** Where Katip sends each tab's sound, following the settings kept for sites and single tabs. */
export class TabSounds extends Context.Service<
  TabSounds,
  {
    readonly sync: Effect.Effect<void, BrowserApiError>
    handle(report: PageReport): Effect.Effect<void>
    choose(
      tabId: TabId,
      output: string | null,
      scope: TabSoundView["scope"],
    ): Effect.Effect<void, BrowserApiError>
    reset(tabId: TabId): Effect.Effect<void, BrowserApiError>
    forget(tabId: TabId): Effect.Effect<void>
    followNavigation(tab: BrowserTab): Effect.Effect<void>
    /** The tabs whose sound Katip sends somewhere, as the side panel shows them. */
    readonly views: Effect.Effect<ReadonlyMap<TabId, TabSoundView>>
    /** Emits whenever a tab's sound changes where it goes or how far it got. */
    readonly changes: Stream.Stream<void>
  }
>()("katip/background/TabSounds") {
  static readonly layer = Layer.effect(TabSounds, makeTabSounds)
}
