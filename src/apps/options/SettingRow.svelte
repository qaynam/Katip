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
    problem = null,
    disabled = false,
    labelsControl = true,
    children,
  }: {
    label: string
    description?: string
    problem?: string | null
    disabled?: boolean
    /**
     * `false` ならラベルをコントロールの名前にしない。ボタンのように、中の文字が名前になる
     * コントロールに使う。
     */
    labelsControl?: boolean
    children: Snippet<[RowControlAttributes]>
  } = $props()

  const id = $props.id()
  const controlId = `${id}-control`
  const descriptionId = `${id}-description`
  const problemId = `${id}-problem`

  const describedBy = $derived(
    [description === undefined ? null : descriptionId, problem === null ? null : problemId]
      .filter((describing) => describing !== null)
      .join(" ") || undefined,
  )
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
    {#if problem !== null}
      <p id={problemId} class="problem">{problem}</p>
    {/if}
  </div>
  <div class="control">
    {@render children({ id: controlId, "aria-describedby": describedBy })}
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    min-height: 22px;
    padding: 9px 12px;
  }

  .text {
    flex: 1;
    min-width: 0;
  }

  .label {
    display: block;
    line-height: 1.35;
  }

  .disabled .label {
    color: var(--tertiary-label);
  }

  .description,
  .problem {
    margin: 2px 0 0;
    font-size: 11.5px;
    line-height: 1.45;
    text-wrap: pretty;
  }

  .description {
    color: var(--secondary-label);
  }

  .problem {
    color: var(--danger);
  }

  .control {
    display: flex;
    flex: none;
    align-items: center;
    gap: 6px;
  }
</style>
