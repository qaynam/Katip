<script lang="ts">
  import "./theme.css"
  import { Option } from "effect"
  import {
    resolveLocale,
    type LocalePreference,
    type MessageKey,
    type Translator,
    type TranslatorLoader,
  } from "#modules/i18n"
  import { neutralTheme } from "#modules/theme"
  import type { Release } from "#modules/updates"
  import type { CommandOutcome, SidebarCommand, SidebarView } from "#protocol"
  import Sidebar from "./components/Sidebar.svelte"
  import ThemedSurface from "./components/ThemedSurface.svelte"
  import Toasts from "./components/Toasts.svelte"
  import type { Downloads } from "./connection/downloads"
  import type { LocalePreferences } from "./connection/locale-preferences"
  import type { OriginAccess } from "./connection/origin-access"
  import { noPageOutputs, type PageOutputAccess } from "./connection/page-outputs"
  import type { ScrollPositions } from "./connection/scroll-positions"
  import type { SidePanel } from "./connection/side-panel"
  import type { SidebarConnection, Undelivered } from "./connection/sidebar-connection"
  import type { UpdateNotices } from "./connection/update-notices"
  import { noFaviconResolver, type FaviconResolver } from "./logic/favicon"
  import { findActiveSpace } from "./logic/view-queries"
  import { BodyPanelController } from "./state/body-panel.svelte"
  import { PendingActivation } from "./state/pending-activation.svelte"
  import { ShownTranslator } from "./state/shown-translator.svelte"
  import { ToastQueue } from "./state/toast-queue.svelte"

  interface Props {
    connection: SidebarConnection
    originAccess: OriginAccess
    /** What tabs' pages know of the outputs. None reachable when not given. */
    pageOutputs?: PageOutputAccess
    downloads: Downloads
    localePreferences: LocalePreferences
    /**
     * Language tags in order of preference, like `navigator.languages`. Used when the language
     * setting is auto.
     */
    browserLanguages: ReadonlyArray<string>
    /** The translator into each language, read from that language's catalog. */
    loadTranslator: TranslatorLoader
    /** The translator into the language the auto setting picks from `browserLanguages`. */
    initialTranslator: Translator
    faviconUrl?: FaviconResolver
    scrollPositions: ScrollPositions
    updateNotices: UpdateNotices
    sidePanel: SidePanel
    onReload?: () => void
  }

  const {
    connection,
    originAccess,
    pageOutputs = noPageOutputs,
    downloads,
    localePreferences,
    browserLanguages,
    loadTranslator,
    initialTranslator,
    faviconUrl = noFaviconResolver,
    scrollPositions,
    updateNotices,
    sidePanel,
    onReload = () => location.reload(),
  }: Props = $props()

  // Until the setting arrives, the browser language is used. Showing nothing until then would
  // hide that the panel is loading
  let localePreference = $state<LocalePreference>("auto")
  $effect(() => localePreferences.listen((preference) => (localePreference = preference)))
  // Only the translator and the loader it opened with: neither changes while the page is open
  // svelte-ignore state_referenced_locally
  const shownTranslator = new ShownTranslator(initialTranslator, loadTranslator, () =>
    resolveLocale(localePreference, browserLanguages),
  )
  const translator = $derived(shownTranslator.current)

  $effect(() => {
    document.documentElement.lang = translator.languageTag
  })

  let updateNotice = $state.raw<Release | null>(null)
  $effect(() => {
    void updateNotices.pending().then((release) => (updateNotice = release))
  })

  const dismissUpdate = () => {
    if (updateNotice !== null) updateNotices.dismiss(updateNotice.version)
    updateNotice = null
  }

  let receivedView = $state.raw<SidebarView | null>(null)
  const pendingActivation = new PendingActivation()
  const view = $derived(receivedView === null ? null : pendingActivation.shown(receivedView))
  const activeSpace = $derived(view === null ? null : Option.getOrNull(findActiveSpace(view)))
  const toasts = new ToastQueue()
  const bodyPanel = new BodyPanelController()

  $effect(() =>
    connection.listen((event) => {
      if (event._tag === "ViewUpdated") {
        receivedView = event.view
        pendingActivation.settleWith(event.view)
      } else if (event._tag === "Notice") {
        const tabId = event.switchToTabId
        toasts.show(
          event.message,
          "info",
          tabId === undefined ? undefined : () => void run({ _tag: "ActivateTab", tabId }),
        )
      } else if (event._tag === "ShowPanel") bodyPanel.show(event.panel)
      else if (receivedView !== null) sidePanel.close(receivedView.windowId)
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
    {bodyPanel}
    {translator}
    {originAccess}
    {pageOutputs}
    {downloads}
    {faviconUrl}
    {scrollPositions}
    {sidePanel}
    {updateNotice}
    onDismissUpdate={dismissUpdate}
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
