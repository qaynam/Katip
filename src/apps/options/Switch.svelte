<script lang="ts">
  import type { RowControlAttributes } from "./SettingRow.svelte"

  let {
    checked,
    onchange,
    ...control
  }: RowControlAttributes & {
    checked: boolean
    onchange: (checked: boolean) => void
  } = $props()
</script>

<input
  {...control}
  type="checkbox"
  role="switch"
  {checked}
  onchange={(event) => onchange(event.currentTarget.checked)}
/>

<style>
  input {
    appearance: none;
    position: relative;
    flex: none;
    width: 30px;
    height: 18px;
    margin: 0 2px;
    border-radius: 9px;
    background: var(--switch-off);
    transition: background-color 160ms ease;
  }

  input::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--switch-knob);
    box-shadow: var(--shadow-active);
    transition:
      transform 160ms cubic-bezier(0.3, 0.7, 0.4, 1),
      background-color 160ms ease;
  }

  input:checked {
    background: var(--text);
  }

  input:checked::after {
    background: var(--switch-knob-on);
    transform: translateX(12px);
  }

  @media (prefers-reduced-motion: reduce) {
    input,
    input::after {
      transition: none;
    }
  }
</style>
