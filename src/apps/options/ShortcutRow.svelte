<script lang="ts">
  import KeyCaps from "./KeyCaps.svelte"
  import Switch from "./Switch.svelte"

  let {
    label,
    shortcut,
    notSetLabel,
    toggle,
  }: {
    label: string
    /** `null` when no key is assigned, `undefined` while the assigned key isn't known. */
    shortcut: string | null | undefined
    notSetLabel: string
    /** A switch that turns the command on, for commands that do nothing until turned on. */
    toggle?:
      { readonly checked: boolean; readonly onchange: (checked: boolean) => void } | undefined
  } = $props()

  const id = $props.id()
  const labelId = `${id}-label`
  const keysId = `${id}-keys`
  const switchId = `${id}-switch`
</script>

<div class="row">
  <dt id={labelId} class="label">
    {#if toggle === undefined}
      {label}
    {:else}
      <label for={switchId}>{label}</label>
    {/if}
  </dt>
  <dd class="keys" aria-labelledby={labelId}>
    {#if shortcut !== undefined}
      <KeyCaps id={keysId} {shortcut} {notSetLabel} />
    {/if}
    {#if toggle !== undefined}
      <Switch
        id={switchId}
        aria-describedby={shortcut === undefined ? undefined : keysId}
        checked={toggle.checked}
        onchange={toggle.onchange}
      />
    {/if}
  </dd>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 48px;
    padding: 9px 0;
    box-sizing: border-box;
  }

  .row:not(:first-child) {
    border-top: 0.5px solid var(--divider);
  }

  .label {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    letter-spacing: -0.003em;
  }

  .keys {
    display: flex;
    flex: none;
    align-items: center;
    gap: 14px;
    margin: 0;
  }
</style>
