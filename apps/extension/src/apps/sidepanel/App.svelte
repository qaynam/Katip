<script lang="ts">
  import "./theme.css"
  import { Option } from "effect"
  import {
    makeTranslator,
    resolveLocale,
    type LocalePreference,
    type MessageKey,
  } from "#modules/i18n"
  import { neutralTheme } from "#modules/theme"
  import type { CommandOutcome, SidebarCommand, SidebarView } from "#protocol"
  import Sidebar from "./components/Sidebar.svelte"
  import ThemedSurface from "./components/ThemedSurface.svelte"
  import Toasts from "./components/Toasts.svelte"
  import type { LocalePreferences } from "./connection/locale-preferences"
  import type { OriginAccess } from "./connection/origin-access"
  import type { ScrollPositions } from "./connection/scroll-positions"
  import type { SidebarConnection, Undelivered } from "./connection/sidebar-connection"
  import { noFaviconResolver, type FaviconResolver } from "./logic/favicon"
  import { findActiveSpace } from "./logic/view-queries"
  import { PendingActivation } from "./state/pending-activation.svelte"
  import { ToastQueue } from "./state/toast-queue.svelte"

  interface Props {
    connection: SidebarConnection
    originAccess: OriginAccess
    localePreferences: LocalePreferences
    /**
     * Language tags in order of preference, like `navigator.languages`. Used when the language
     * setting is auto.
     */
    browserLanguages: ReadonlyArray<string>
    faviconUrl?: FaviconResolver
    scrollPositions: ScrollPositions
    onReload?: () => void
  }

  const {
    connection,
    originAccess,
    localePreferences,
    browserLanguages,
    faviconUrl = noFaviconResolver,
    scrollPositions,
    onReload = () => location.reload(),
  }: Props = $props()

  // Until the setting arrives, the browser language is used. Showing nothing until then would
  // hide that the panel is loading
  let localePreference = $state<LocalePreference>("auto")
  $effect(() => localePreferences.listen((preference) => (localePreference = preference)))
  const translator = $derived(makeTranslator(resolveLocale(localePreference, browserLanguages)))

  $effect(() => {
    document.documentElement.lang = translator.languageTag
  })

  let receivedView = $state.raw<SidebarView | null>(null)
  const pendingActivation = new PendingActivation()
  const view = $derived(receivedView === null ? null : pendingActivation.shown(receivedView))
  const activeSpace = $derived(view === null ? null : Option.getOrNull(findActiveSpace(view)))
  const toasts = new ToastQueue()

  $effect(() =>
    connection.listen((event) => {
      if (event._tag === "ViewUpdated") {
        receivedView = event.view
        pendingActivation.settleWith(event.view)
      } else toasts.show(event.message)
    }),
  )

  const undeliveredMessages = {
    Disconnected: "sidepanel.connection.lost",
    NotConnected: "sidepanel.connection.notConnected",
  } as const satisfies Record<Undelivered["reason"], MessageKey>

  const run = async (command: SidebarCommand): Promise<CommandOutcome> => {
    if (command._tag === "ActivateTab") pendingActivation.start(command.tabId)
    const result = await connection.run(command)
    const outcome: CommandOutcome =
      result._tag === "Undelivered"
        ? { _tag: "Failed", reason: translator.t(undeliveredMessages[result.reason]) }
        : result
    if (outcome._tag === "Failed") {
      toasts.show(outcome.reason, "error")
      if (command._tag === "ActivateTab") pendingActivation.fail(command.tabId)
    }
    return outcome
  }
</script>

{#if view !== null && activeSpace !== null}
  <Sidebar
    {view}
    {activeSpace}
    {run}
    {toasts}
    {translator}
    {originAccess}
    {faviconUrl}
    {scrollPositions}
    {onReload}
  />
{:else}
  <ThemedSurface theme={neutralTheme} transitionKey="waiting">
    <div class="waiting">
      <p class="waiting-message" role="status">
        {translator.t(view === null ? "sidepanel.loading" : "sidepanel.noSpaces")}
      </p>
      <div class="waiting-toasts"><Toasts {toasts} {translator} /></div>
    </div>
  </ThemedSurface>
{/if}

<style>
  .waiting {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
  }

  .waiting-message {
    margin: 0;
    color: var(--text-muted);
    text-align: center;
  }

  .waiting-toasts {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
  }
</style>
