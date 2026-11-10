<script lang="ts">
  import { Option } from "effect"
  import type { SpaceView } from "#protocol"
  import { spaceNameChange } from "../logic/drafts"
  import { pointRect } from "../logic/menu-position"
  import { getSidebarContext } from "../state/sidebar-context"
  import Icon from "./Icon.svelte"
  import { spaceMenuEntries } from "./menus"
  import TitleEditor from "./TitleEditor.svelte"

  interface Props {
    space: SpaceView
  }

  const { space }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)
  let header = $state<HTMLElement>()
  let isEditing = $state(false)

  $effect(() => {
    const steps = ctx.spaceSetup.consume(space.id)
    if (Option.isNone(steps)) return
    if (steps.value.rename) isEditing = true
    if (steps.value.editTheme && header !== undefined) {
      ctx.themePicker.open({
        spaceId: space.id,
        anchor: header.getBoundingClientRect(),
        takesFocus: !steps.value.rename,
      })
    }
  })

  const rename = (draft: string) => {
    isEditing = false
    const change = spaceNameChange(draft, space.name)
    if (Option.isSome(change)) {
      void ctx.run({ _tag: "RenameSpace", spaceId: space.id, name: change.value })
    }
  }

  const toggleMenu = (event: MouseEvent & { currentTarget: HTMLButtonElement }) => {
    ctx.menu.toggle({
      label: t("sidepanel.space.menu"),
      anchor: event.currentTarget.getBoundingClientRect(),
      entries: spaceMenuEntries(ctx, space),
      trigger: event.currentTarget,
    })
  }

  const openMenuAtPointer = (event: MouseEvent) => {
    event.preventDefault()
    ctx.menu.open({
      label: t("sidepanel.space.menu"),
      anchor: pointRect({ x: event.clientX, y: event.clientY }),
      entries: spaceMenuEntries(ctx, space),
      trigger: null,
    })
  }
</script>

<header class="space-title" bind:this={header}>
  {#if isEditing}
    <TitleEditor
      initial={space.name}
      label={t("sidepanel.space.nameLabel")}
      onCommit={rename}
      onCancel={() => (isEditing = false)}
    />
  {:else}
    <h1 class="name">
      <button
        class="name-button"
        type="button"
        ondblclick={() => (isEditing = true)}
        oncontextmenu={openMenuAtPointer}
      >
        {space.name}
      </button>
    </h1>
  {/if}
  <button
    class="more"
    type="button"
    aria-label={t("sidepanel.space.menu")}
    aria-haspopup="menu"
    onclick={toggleMenu}
  >
    <Icon name="more" size={14} />
  </button>
</header>

<style>
  .space-title {
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
    height: 32px;
    margin: 6px 8px 2px;
    padding: 0 2px 0 8px;
  }

  .name {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.005em;
  }

  .name-button {
    display: block;
    max-width: 100%;
    padding: 0;
    overflow: hidden;
    border: none;
    background: none;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .more {
    display: grid;
    flex: none;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-muted);
    transition:
      color 120ms ease,
      background-color 120ms ease;
  }

  .more:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .space-title :global(.title-editor) {
    font-size: 13px;
    font-weight: 600;
  }
</style>
