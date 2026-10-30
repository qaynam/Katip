<script lang="ts">
  import "./theme.css"
  import { Option } from "effect"
  import { neutralTheme } from "#modules/theme"
  import type { SidebarCommand, SidebarView } from "#protocol"
  import Sidebar from "./components/Sidebar.svelte"
  import ThemedSurface from "./components/ThemedSurface.svelte"
  import Toasts from "./components/Toasts.svelte"
  import type { OriginAccess } from "./connection/origin-access"
  import type { SidebarConnection } from "./connection/sidebar-connection"
  import { noFaviconResolver, type FaviconResolver } from "./logic/favicon"
  import { findActiveSpace } from "./logic/view-queries"
  import { ToastQueue } from "./state/toast-queue.svelte"

  interface Props {
    connection: SidebarConnection
    originAccess: OriginAccess
    faviconUrl?: FaviconResolver
    onReload?: () => void
  }

  const {
    connection,
    originAccess,
    faviconUrl = noFaviconResolver,
    onReload = () => location.reload(),
  }: Props = $props()

  let view = $state.raw<SidebarView | null>(null)
  const activeSpace = $derived(view === null ? null : Option.getOrNull(findActiveSpace(view)))
  const toasts = new ToastQueue()

  $effect(() =>
    connection.listen((event) => {
      if (event._tag === "ViewUpdated") view = event.view
      else toasts.show(event.message)
    }),
  )

  const run = async (command: SidebarCommand) => {
    const outcome = await connection.run(command)
    if (outcome._tag === "Failed") toasts.show(outcome.reason, "error")
    return outcome
  }
</script>

{#if view !== null && activeSpace !== null}
  <Sidebar {view} {activeSpace} {run} {toasts} {originAccess} {faviconUrl} {onReload} />
{:else}
  <ThemedSurface theme={neutralTheme} transitionKey="waiting">
    <div class="waiting">
      <p class="waiting-message" role="status">
        {view === null ? "サイドバーを読み込んでいます…" : "表示できる Space がありません"}
      </p>
      <div class="waiting-toasts"><Toasts {toasts} /></div>
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
