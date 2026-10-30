<script lang="ts" module>
  export interface PopUpOption<Value extends string | number> {
    readonly value: Value
    readonly label: string
    /** 表示中の言語と違う言語で書いた選択肢に付ける。 */
    readonly lang?: string
  }
</script>

<script lang="ts" generics="Value extends string | number">
  import type { RowControlAttributes } from "./SettingRow.svelte"

  let {
    value,
    options,
    disabled = false,
    onchange,
    ...control
  }: RowControlAttributes & {
    value: Value
    options: ReadonlyArray<PopUpOption<Value>>
    disabled?: boolean
    onchange: (value: Value) => void
  } = $props()

  const choose = (selected: string) => {
    const chosen = options.find((option) => String(option.value) === selected)
    if (chosen !== undefined) onchange(chosen.value)
  }
</script>

<!-- 独自のメニューを組まずに select を使い、キー操作や読み上げはブラウザに任せる。
     一覧の見た目は、選択肢を装飾できるブラウザでだけサイドバーのメニューにそろえる -->
<span class="pop-up">
  <select {...control} {value} {disabled} onchange={(event) => choose(event.currentTarget.value)}>
    {#each options as option (option.value)}
      <option value={option.value} lang={option.lang}>{option.label}</option>
    {/each}
  </select>
  <svg class="chevrons" viewBox="0 0 8 12" aria-hidden="true">
    <path d="M1.5 4.25L4 1.75l2.5 2.5M1.5 7.75L4 10.25l2.5-2.5" />
  </svg>
</span>

<style>
  .pop-up {
    position: relative;
    display: inline-flex;
    min-width: 0;
  }

  select {
    appearance: none;
    display: inline-flex;
    align-items: center;
    min-width: 0;
    max-width: 100%;
    height: 26px;
    padding: 0 26px 0 10px;
    overflow: hidden;
    border: none;
    border-radius: 7px;
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  select:disabled {
    color: var(--text-muted);
    opacity: 0.6;
  }

  .chevrons {
    position: absolute;
    top: 50%;
    right: 9px;
    width: 8px;
    height: 12px;
    transform: translateY(-50%);
    fill: none;
    stroke: var(--text-muted);
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: none;
  }

  @supports (appearance: base-select) {
    select,
    select::picker(select) {
      appearance: base-select;
    }

    select::picker-icon {
      display: none;
    }

    select::picker(select) {
      min-width: anchor-size(width);
      margin-block: 4px;
      padding: 5px;
      border: 0.5px solid var(--glass-border);
      border-radius: 11px;
      background: var(--glass-bg);
      box-shadow: var(--glass-shadow);
      color: var(--glass-text);
      -webkit-backdrop-filter: blur(28px) saturate(1.6);
      backdrop-filter: blur(28px) saturate(1.6);
    }

    option {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 0 9px 0 6px;
      border-radius: 6px;
      white-space: nowrap;
    }

    option:hover,
    option:focus-visible {
      outline: none;
      background: var(--glass-hover);
    }

    option::checkmark {
      width: 12px;
      color: var(--glass-muted);
    }
  }
</style>
