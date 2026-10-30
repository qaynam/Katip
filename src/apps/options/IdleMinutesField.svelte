<script lang="ts">
  import { Result } from "effect"
  import type { IdleMinutes } from "#modules/settings"
  import { parseIdleMinutesInput } from "./idle-minutes-input"

  let {
    value,
    disabled,
    oncommit,
  }: {
    value: IdleMinutes
    disabled: boolean
    oncommit: (minutes: IdleMinutes) => void
  } = $props()

  const id = $props.id()
  // $state で持つと、サイドパネルなど他の画面で保存値が変わっても古い値を表示し続けてしまう
  let draft = $derived(String(value))
  let problem = $state<string | null>(null)

  const commit = () => {
    Result.match(parseIdleMinutesInput(draft), {
      onFailure: (reason) => {
        problem = reason
      },
      onSuccess: (minutes) => {
        problem = null
        if (minutes !== value) oncommit(minutes)
      },
    })
  }
</script>

<div class="field" class:disabled>
  <label for={id}>アーカイブするまでの時間</label>
  <div class="control">
    <input
      {id}
      type="number"
      inputmode="numeric"
      min="1"
      step="1"
      {disabled}
      value={draft}
      aria-invalid={problem !== null}
      aria-describedby="{id}-hint{problem === null ? '' : ` ${id}-problem`}"
      oninput={(event) => (draft = event.currentTarget.value)}
      onchange={commit}
    />
    <span class="unit">分</span>
  </div>
  <p id="{id}-hint" class="hint">最後に表示してからこの時間が過ぎた一時タブが対象です。</p>
  {#if problem !== null}
    <p id="{id}-problem" class="problem">{problem}</p>
  {/if}
</div>

<style>
  .field {
    padding: 4px 0 16px;
  }

  .field.disabled label,
  .field.disabled .unit,
  .field.disabled .hint {
    color: var(--ink-faint);
  }

  label {
    display: block;
    font-weight: 600;
    line-height: 1.5;
  }

  .control {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: 8px;
  }

  input {
    width: 8ch;
    padding: 6px 10px;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
    text-align: right;
    appearance: textfield;
  }

  input::-webkit-inner-spin-button,
  input::-webkit-outer-spin-button {
    appearance: none;
    margin: 0;
  }

  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  input[aria-invalid="true"] {
    border-color: var(--danger);
  }

  input:disabled {
    background: var(--surface-sunken);
    color: var(--ink-faint);
    cursor: not-allowed;
  }

  .unit {
    color: var(--ink-muted);
  }

  .hint,
  .problem {
    margin: 6px 0 0;
    font-size: 0.8125rem;
    line-height: 1.6;
  }

  .hint {
    color: var(--ink-muted);
  }

  .problem {
    color: var(--danger);
    font-weight: 600;
  }
</style>
