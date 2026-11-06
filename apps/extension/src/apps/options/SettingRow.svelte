<script lang="ts" module>
  /** Attributes for a row's control that tie the row's label and description to it. */
  export interface RowControlAttributes {
    readonly id: string
    readonly "aria-describedby": string | undefined
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte"

  let {
    label,
    description,
    disabled = false,
    labelsControl = true,
    children,
  }: {
    label: string
    description?: string | undefined
    disabled?: boolean
    /**
     * When `false`, the label doesn't name the control. For controls named by their own text,
     * like buttons, and for rows that only show a value.
     */
    labelsControl?: boolean
    children: Snippet<[RowControlAttributes]>
  } = $props()

  const id = $props.id()
  const controlId = `${id}-control`
  const descriptionId = `${id}-description`
</script>

<div class="row" class:disabled>
  <div class="text">
    {#if labelsControl}
      <label class="label" for={controlId}>{label}</label>
    {:else}
      <span class="label">{label}</span>
    {/if}
    {#if description !== undefined}
      <p id={descriptionId} class="description">{description}</p>
    {/if}
  </div>
  <div class="control">
    {@render children({
      id: controlId,
      "aria-describedby": description === undefined ? undefined : descriptionId,
    })}
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    box-sizing: border-box;
    min-height: 48px;
    padding: 11px 0;
  }

  .row:not(:first-child) {
    border-top: 0.5px solid var(--divider);
  }

  .text {
    flex: 1;
    min-width: 0;
  }

  .label {
    display: block;
    font-size: 14px;
    letter-spacing: -0.003em;
    transition: color 120ms ease;
  }

  .disabled .label {
    color: var(--text-muted);
  }

  .description {
    max-width: 60ch;
    margin: 3px 0 0;
    color: var(--text-muted);
    font-size: 12.5px;
    font-weight: 400;
    line-height: 1.5;
    text-wrap: pretty;
  }

  .control {
    display: flex;
    flex: none;
    align-items: center;
    max-width: 60%;
  }
</style>
