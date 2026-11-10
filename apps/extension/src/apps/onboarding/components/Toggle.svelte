<script lang="ts">
  let {
    checked,
    onchange,
    ...attributes
  }: {
    checked: boolean
    onchange: (checked: boolean) => void
    "aria-labelledby"?: string
    "aria-label"?: string
    id?: string
  } = $props()
</script>

<input
  {...attributes}
  class="toggle"
  type="checkbox"
  role="switch"
  {checked}
  onchange={(event) => onchange(event.currentTarget.checked)}
/>

<style>
  .toggle {
    position: relative;
    flex: none;
    width: 42px;
    height: 25px;
    margin: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ink) 16%, transparent);
    appearance: none;
    cursor: pointer;
    transition: background 160ms ease;
  }

  .toggle::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 21px;
    height: 21px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
    transition: translate 160ms ease;
  }

  .toggle:checked {
    background: var(--button);
  }

  .toggle:checked::after {
    translate: 17px 0;
  }
</style>
