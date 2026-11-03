<script lang="ts">
  import { untrack } from "svelte"

  interface Props {
    initial: string
    label: string
    onCommit: (draft: string) => void
    onCancel: () => void
  }

  const { initial, label, onCommit, onCancel }: Props = $props()

  // A new view arriving mid-edit may change initial, but must not overwrite what's being typed
  let draft = $state(untrack(() => initial))
  // Committing with Enter removes the input, which also fires blur, so don't commit twice
  let isSettled = false

  const commit = () => {
    if (isSettled) return
    isSettled = true
    onCommit(draft)
  }

  const cancel = () => {
    if (isSettled) return
    isSettled = true
    onCancel()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    // The Enter that commits IME composition must not commit the name as well
    if (event.isComposing) return
    if (event.key === "Enter") {
      event.preventDefault()
      commit()
    } else if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
  }

  const focusAndSelect = (input: HTMLInputElement) => {
    input.focus()
    input.select()
  }
</script>

<input
  class="title-editor"
  type="text"
  aria-label={label}
  bind:value={draft}
  onkeydown={onKeyDown}
  onblur={commit}
  {@attach focusAndSelect}
/>

<style>
  .title-editor {
    flex: 1;
    min-width: 0;
    height: 26px;
    margin: 0 -2px;
    padding: 0 7px;
    border: none;
    border-radius: 7px;
    outline: 1.5px solid var(--focus-ring);
    background: var(--surface-active);
    color: var(--text);
    font: inherit;
  }
</style>
