<script lang="ts">
  import { untrack } from "svelte"

  interface Props {
    initial: string
    label: string
    onCommit: (draft: string) => void
    onCancel: () => void
  }

  const { initial, label, onCommit, onCancel }: Props = $props()

  // 入力中に新しいビューが届いて initial が変わっても、打ちかけの文字を上書きしない
  let draft = $state(untrack(() => initial))
  // Enter で確定して入力欄が消えるときにも blur が起きるので、二重に確定させない
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
    // 日本語入力の変換を確定する Enter で、名前まで確定させない
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
    height: 24px;
    padding: 0 6px;
    margin: 0 -2px;
    border: none;
    border-radius: 6px;
    outline: 2px solid var(--focus-ring);
    background: var(--surface-active);
    color: var(--text-on-surface);
    font: inherit;
  }
</style>
