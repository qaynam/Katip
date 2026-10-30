<script lang="ts">
  import "./theme.css"
  import { Option } from "effect"
  import type { SidebarCommand, SidebarView } from "#protocol"
  import Sidebar from "./components/Sidebar.svelte"
  import Toasts from "./components/Toasts.svelte"
  import type { SidebarConnection } from "./connection/sidebar-connection"
  import { noFaviconResolver, type FaviconResolver } from "./logic/favicon"
  import { findActiveSpace } from "./logic/view-queries"
  import { ToastQueue } from "./state/toast-queue.svelte"

  interface Props {
    connection: SidebarConnection
    faviconUrl?: FaviconResolver
    onReload?: () => void
  }

  const {
    connection,
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
  <Sidebar {view} {activeSpace} {run} {toasts} {faviconUrl} {onReload} />
{:else}
  <div class="katip-root waiting" data-space-color="grey">
    <p class="waiting-message" role="status">
      {view === null ? "サイドバーを読み込んでいます…" : "表示できる Space がありません"}
    </p>
    <div class="waiting-toasts"><Toasts {toasts} /></div>
  </div>
{/if}

<style>
  .waiting {
    display: flex;
    flex-direction: column;
    justify-content: center;
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
