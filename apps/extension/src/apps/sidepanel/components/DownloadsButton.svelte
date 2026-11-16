<script lang="ts">
  import type { DownloadsAccess } from "../connection/downloads"
  import { pointRect } from "../logic/menu-position"
  import { action } from "../state/menu-controller.svelte"
  import { getSidebarContext } from "../state/sidebar-context"
  import Icon from "./Icon.svelte"

  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)

  // Known before any click, as the click has to decide without waiting whether to ask
  let access = $state<DownloadsAccess | null>(null)
  $effect(() => {
    void ctx.downloads.access().then((found) => (access = found))
  })

  const openDownloadsPage = () =>
    void ctx.run({ _tag: "OpenDownloadsPage", windowId: ctx.view.windowId })

  const askThenShow = async () => {
    const isGranted = await ctx.downloads.request()
    access = isGranted ? "Granted" : "Declined"
    if (isGranted) ctx.bodyPanel.show("Downloads")
    else openDownloadsPage()
  }

  const showDownloads = () => {
    ctx.tooltip.hide()
    if (access === "Declined") openDownloadsPage()
    else void askThenShow()
  }

  // Without permission, the button only opens the browser's downloads page, so this is the way
  // left to be asked again
  const openMenu = (event: MouseEvent) => {
    if (access === "Granted") return
    event.preventDefault()
    ctx.tooltip.hide()
    ctx.menu.open({
      label: t("sidepanel.downloads.title"),
      anchor: pointRect({ x: event.clientX, y: event.clientY }),
      entries: [action(t("sidepanel.downloads.showHere"), () => void askThenShow())],
      trigger: null,
    })
  }

  const showName = (event: PointerEvent) =>
    ctx.tooltip.schedule(
      { title: t("sidepanel.downloads.title") },
      { x: event.clientX, y: event.clientY },
    )
</script>

<button
  class="icon-button"
  type="button"
  aria-label={t("sidepanel.downloads.title")}
  onclick={showDownloads}
  oncontextmenu={openMenu}
  onpointerenter={showName}
  onpointermove={(event) => ctx.tooltip.follow({ x: event.clientX, y: event.clientY })}
  onpointerleave={() => ctx.tooltip.hide()}
>
  <Icon name="download" />
</button>

<style>
  .icon-button {
    display: grid;
    flex: none;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--text-muted);
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .icon-button:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
</style>
