<script lang="ts" module>
  /** 行のコントロールに付ける属性。ラベルと説明文をコントロールに結びつける。 */
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
    description?: string
    disabled?: boolean
    /**
     * `false` ならラベルをコントロールの名前にしない。ボタンのように中の文字が名前になる
     * コントロールや、コントロールの無い表示だけの行に使う。
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
    gap: 16px;
    box-sizing: border-box;
    min-height: var(--row-height);
    padding: 7px 8px 7px 12px;
    border-radius: var(--radius-row);
    background: var(--surface-raised);
  }

  .text {
    flex: 1;
    min-width: 0;
  }

  .label {
    display: block;
    font-size: 13.5px;
    letter-spacing: -0.003em;
    transition: color 120ms ease;
  }

  .disabled .label {
    color: var(--text-muted);
  }

  .description {
    margin: 2px 0 0;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.45;
    text-wrap: pretty;
  }

  .control {
    display: flex;
    flex: none;
    align-items: center;
    max-width: 60%;
  }
</style>
