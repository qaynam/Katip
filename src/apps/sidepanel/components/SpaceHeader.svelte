<script lang="ts">
  import { Option } from "effect"
  import type { SpaceView } from "#protocol"
  import { spaceNameChange } from "../logic/drafts"
  import { action, separator, type MenuEntry } from "../state/menu-controller.svelte"
  import { getSidebarContext } from "../state/sidebar-context"
  import Icon from "./Icon.svelte"
  import { createFolder } from "./menus"
  import TitleEditor from "./TitleEditor.svelte"

  interface Props {
    space: SpaceView
    canDelete: boolean
    isArchiveOpen: boolean
    onToggleArchive: () => void
  }

  const { space, canDelete, isArchiveOpen, onToggleArchive }: Props = $props()
  const ctx = getSidebarContext()
  let isEditing = $state(false)

  const rename = (draft: string) => {
    isEditing = false
    const change = spaceNameChange(draft, space.name)
    if (Option.isSome(change)) {
      void ctx.run({ _tag: "RenameSpace", spaceId: space.id, name: change.value })
    }
  }

  const confirmDeletion = async () => {
    const confirmed = await ctx.dialog.confirm({
      title: `「${space.name}」を削除しますか？`,
      message:
        "この Space のピン留めとフォルダも削除されます。開いている一時タブは閉じずに、別の Space に移動します。",
      confirmLabel: "Space を削除",
    })
    if (confirmed) void ctx.run({ _tag: "DeleteSpace", spaceId: space.id })
  }

  const menuEntries = (): ReadonlyArray<MenuEntry> => {
    const canCreateFolder = space.pinned._tag === "Available" && space.pinned.canCreateFolder
    return [
      {
        _tag: "ColorPicker",
        label: "Space の色",
        selected: space.color,
        onPick: (color) => void ctx.run({ _tag: "RecolorSpace", spaceId: space.id, color }),
      },
      separator,
      ...(canCreateFolder ? [action("新しいフォルダ", () => void createFolder(ctx, null))] : []),
      action("名前を変更", () => (isEditing = true)),
      action("Space を削除", () => void confirmDeletion(), {
        tone: "danger",
        disabled: !canDelete,
      }),
      separator,
      action("設定を開く", () => void ctx.run({ _tag: "OpenSettings" })),
    ]
  }

  const toggleMenu = (event: MouseEvent & { currentTarget: HTMLButtonElement }) => {
    ctx.menu.toggle({
      label: "Space のメニュー",
      anchor: event.currentTarget.getBoundingClientRect(),
      entries: menuEntries(),
      trigger: event.currentTarget,
    })
  }
</script>

<header class="space-header">
  {#if isEditing}
    <TitleEditor
      initial={space.name}
      label="Space の名前"
      onCommit={rename}
      onCancel={() => (isEditing = false)}
    />
  {:else}
    <h1 class="name" title="ダブルクリックで名前を変更">
      <button class="name-button" type="button" ondblclick={() => (isEditing = true)}>
        {space.name}
      </button>
    </h1>
  {/if}
  <button
    class="icon-button"
    class:pressed={isArchiveOpen}
    type="button"
    aria-label="アーカイブ"
    aria-pressed={isArchiveOpen}
    title="アーカイブ"
    onclick={onToggleArchive}
  >
    <Icon name="archive" />
  </button>
  <button
    class="icon-button"
    type="button"
    aria-label="Space のメニュー"
    aria-haspopup="menu"
    title="Space のメニュー"
    onclick={toggleMenu}
  >
    <Icon name="more" />
  </button>
</header>

<style>
  .space-header {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 40px;
    padding: 4px 6px 4px 10px;
  }

  .name {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 15px;
    font-weight: 650;
    letter-spacing: 0.01em;
  }

  .name-button {
    display: block;
    max-width: 100%;
    padding: 0;
    overflow: hidden;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    white-space: nowrap;
    text-overflow: ellipsis;
    cursor: default;
  }

  .icon-button {
    display: grid;
    flex: none;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--text-muted);
  }

  .icon-button:hover {
    background: var(--space-bg-hover);
    color: var(--text);
  }

  .icon-button.pressed {
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
    color: var(--text-on-surface);
  }
</style>
