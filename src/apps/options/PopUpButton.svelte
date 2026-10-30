<script lang="ts" module>
  export interface PopUpOption<Value extends string> {
    readonly value: Value
    readonly label: string
    /** 表示中の言語と違う言語で書いた選択肢に付ける。 */
    readonly lang?: string
  }
</script>

<script lang="ts" generics="Value extends string">
  import type { RowControlAttributes } from "./SettingRow.svelte"

  let {
    value,
    options,
    onchange,
    ...control
  }: RowControlAttributes & {
    value: Value
    options: ReadonlyArray<PopUpOption<Value>>
    onchange: (value: Value) => void
  } = $props()

  const choose = (selected: string) => {
    const chosen = options.find((option) => option.value === selected)
    if (chosen !== undefined) onchange(chosen.value)
  }
</script>

<!-- 独自のメニューを組まずに select を使う。開いた一覧が OS のメニューになり、キー操作や読み上げも OS に揃う -->
<span class="pop-up">
  <select {...control} {value} onchange={(event) => choose(event.currentTarget.value)}>
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
  }

  select {
    appearance: none;
    max-width: 240px;
    margin: 0;
    padding: 3px 24px 3px 9px;
    border: 0;
    border-radius: 6px;
    background: var(--control);
    box-shadow:
      0 0 0 0.5px var(--control-edge),
      var(--control-shadow);
    line-height: 16px;
    text-overflow: ellipsis;
  }

  select:focus-visible {
    outline: 3px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .chevrons {
    position: absolute;
    top: 50%;
    right: 8px;
    width: 8px;
    height: 12px;
    transform: translateY(-50%);
    fill: none;
    stroke: var(--secondary-label);
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: none;
  }
</style>
