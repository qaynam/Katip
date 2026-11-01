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
  import type { SidebarConnection, Undelivered } from "./connection/sidebar-connection"
  import { noFaviconResolver, type FaviconResolver } from "./logic/favicon"
  import { findActiveSpace } from "./logic/view-queries"
  import { ToastQueue } from "./state/toast-queue.svelte"

  interface Props {
    connection: SidebarConnection
    originAccess: OriginAccess
    localePreferences: LocalePreferences
    /** `navigator.languages` と同じく、優先する順に並んだ言語タグ。言語の設定が自動のときに使う */
    browserLanguages: ReadonlyArray<string>
    faviconUrl?: FaviconResolver
    onReload?: () => void
  }

  const {
    connection,
    originAccess,
    localePreferences,
    browserLanguages,
    faviconUrl = noFaviconResolver,
    onReload = () => location.reload(),
  }: Props = $props()

  // 設定が届くまでの一瞬はブラウザの言語で出す。届くまで何も出さないより、読み込み中だと分かる
  let localePreference = $state<LocalePreference>("auto")
  $effect(() => localePreferences.listen((preference) => (localePreference = preference)))
  const translator = $derived(makeTranslator(resolveLocale(localePreference, browserLanguages)))

  $effect(() => {
    document.documentElement.lang = translator.languageTag
  })

  let view = $state.raw<SidebarView | null>(null)
  const activeSpace = $derived(view === null ? null : Option.getOrNull(findActiveSpace(view)))
  const toasts = new ToastQueue()

  $effect(() =>
    connection.listen((event) => {
      if (event._tag === "ViewUpdated") view = event.view
      else toasts.show(event.message)
    }),
  )

  const undeliveredMessages = {
    Disconnected: "sidepanel.connection.lost",
    NotConnected: "sidepanel.connection.notConnected",
  } as const satisfies Record<Undelivered["reason"], MessageKey>

  const run = async (command: SidebarCommand): Promise<CommandOutcome> => {
    const result = await connection.run(command)
    const outcome: CommandOutcome =
      result._tag === "Undelivered"
        ? { _tag: "Failed", reason: translator.t(undeliveredMessages[result.reason]) }
        : result
    if (outcome._tag === "Failed") toasts.show(outcome.reason, "error")
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
