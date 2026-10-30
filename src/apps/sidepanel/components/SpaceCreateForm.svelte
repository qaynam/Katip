<script lang="ts">
  import { Option, Schema } from "effect"
  import { SpaceName, type SpaceColor } from "#modules/space"
  import type { SidebarCommand } from "#protocol"
  import { suggestedSpaceColor } from "../logic/view-queries"
  import { getSidebarContext } from "../state/sidebar-context"
  import ColorSwatches from "./ColorSwatches.svelte"

  interface Props {
    onClose: () => void
  }

  const { onClose }: Props = $props()
  const ctx = getSidebarContext()

  let name = $state("")
  let color = $state<SpaceColor>(suggestedSpaceColor(ctx.view.spaces))

  // 名前を省略すると、background が既存の名前と重ならない名前を付ける
  const create = (event: SubmitEvent) => {
    event.preventDefault()
    const command: SidebarCommand = Option.match(Schema.decodeUnknownOption(SpaceName)(name), {
      onNone: () => ({ _tag: "CreateSpace", windowId: ctx.view.windowId, color }),
      onSome: (spaceName) => ({
        _tag: "CreateSpace",
        windowId: ctx.view.windowId,
        name: spaceName,
        color,
      }),
    })
    void ctx.run(command)
    onClose()
  }

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    onClose()
  }

  const focus = (input: HTMLInputElement) => input.focus()
</script>

<form class="create-form" aria-label="Space を作成" onsubmit={create}>
  <input
    class="name"
    type="text"
    aria-label="新しい Space の名前"
    placeholder="名前（省略すると自動で付けます）"
    bind:value={name}
    onkeydown={closeOnEscape}
    {@attach focus}
  />
  <ColorSwatches label="新しい Space の色" selected={color} onPick={(picked) => (color = picked)} />
  <button class="submit" type="submit">作成</button>
</form>

<style>
  .create-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    border-radius: 14px;
    background: var(--surface-raised);
  }

  .name {
    height: 30px;
    padding: 0 10px;
    border: none;
    border-radius: 8px;
    background: var(--surface-active);
    color: var(--text-on-surface);
    font: inherit;
  }

  .name::placeholder {
    color: color-mix(in srgb, var(--text-on-surface) 50%, transparent);
  }

  .submit {
    align-self: flex-end;
    height: 28px;
    padding: 0 16px;
    border: none;
    border-radius: 8px;
    background: var(--text);
    color: var(--space-bg);
    font: inherit;
    font-weight: 650;
  }
</style>
