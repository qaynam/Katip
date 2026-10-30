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
    width: 34px;
    height: 20px;
    margin: 0;
    border-radius: 10px;
    background: var(--switch-off);
    box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.04);
    transition: background-color 160ms ease-out;
  }

  input::after {
    content: "";
    position: absolute;
    top: 1px;
    left: 1px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--knob);
    box-shadow:
      0 0 0 0.5px rgb(0 0 0 / 0.06),
      0 1px 2px rgb(0 0 0 / 0.22);
    transition: transform 160ms cubic-bezier(0.3, 0.7, 0.4, 1);
  }

  input:checked {
    background: var(--accent);
  }

  input:checked::after {
    transform: translateX(14px);
  }

  input:focus-visible {
    outline: 3px solid var(--focus-ring);
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    input,
    input::after {
      transition: none;
    }
  }
</style>
