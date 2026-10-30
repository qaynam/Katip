<script lang="ts">
  import { Option, Result } from "effect"
  import type { MessageKey, Translator } from "#modules/i18n"
  import type { IdleMinutes } from "#modules/settings"
  import {
    type IdleMinutesProblem,
    parseIdleMinutesInput,
    type StepDirection,
    stepIdleMinutes,
  } from "./idle-minutes-input"
  import SettingRow from "./SettingRow.svelte"

  const problemMessages = {
    Empty: "options.autoArchive.idleTime.empty",
    NotPositiveInteger: "options.autoArchive.idleTime.invalid",
  } as const satisfies Record<IdleMinutesProblem, MessageKey>

  let {
    value,
    disabled,
    translator,
    oncommit,
  }: {
    value: IdleMinutes
    disabled: boolean
    translator: Translator
    oncommit: (minutes: IdleMinutes) => void
  } = $props()

  // $state で持つと、サイドパネルなど他の画面で保存値が変わっても古い値を表示し続けてしまう
  let draft = $derived(String(value))
  // 理由を入力とは別の $state で持つと、保存値の変化で入力欄が戻っても理由だけが残る。
  // 退けた入力を覚え、入力欄がその値のままのときだけ理由を出す
  let rejectedDraft = $state<string | null>(null)

  const parsedDraft = $derived(parseIdleMinutesInput(draft))
  const shownMinutes = $derived(Result.getOrElse(parsedDraft, () => value))
  const problem = $derived(
    draft === rejectedDraft ? Option.getOrNull(Result.getFailure(parsedDraft)) : null,
  )
  const problemText = $derived(problem === null ? null : translator.t(problemMessages[problem]))

  const commit = (minutes: IdleMinutes) => {
    rejectedDraft = null
    draft = String(minutes)
    if (minutes !== value) oncommit(minutes)
  }

  const commitDraft = () => {
    Result.match(parsedDraft, {
      onFailure: () => {
        rejectedDraft = draft
      },
      onSuccess: commit,
    })
  }

  const step = (direction: StepDirection) => commit(stepIdleMinutes(shownMinutes, direction))
</script>

<SettingRow
  label={translator.t("options.autoArchive.idleTime.label")}
  {disabled}
  problem={problemText}
>
  {#snippet children(control)}
    <input
      {...control}
      type="number"
      inputmode="numeric"
      min="1"
      step="1"
      {disabled}
      value={draft}
      aria-invalid={problem !== null}
      oninput={(event) => (draft = event.currentTarget.value)}
      onchange={commitDraft}
    />
    <!-- 入力欄が矢印キーで増減できるので、ボタンはタブ移動の対象から外す -->
    <span class="stepper">
      <button
        type="button"
        tabindex="-1"
        aria-label={translator.t("options.stepper.increment")}
        {disabled}
        onclick={() => step("Increment")}
      >
        <svg viewBox="0 0 8 5" aria-hidden="true"><path d="M1.5 4L4 1.5 6.5 4" /></svg>
      </button>
      <button
        type="button"
        tabindex="-1"
        aria-label={translator.t("options.stepper.decrement")}
        {disabled}
        onclick={() => step("Decrement")}
      >
        <svg viewBox="0 0 8 5" aria-hidden="true"><path d="M1.5 1L4 3.5 6.5 1" /></svg>
      </button>
    </span>
    <span class="unit">
      {translator.t("options.autoArchive.idleTime.unit", { count: shownMinutes })}
    </span>
  {/snippet}
</SettingRow>

<style>
  input {
    width: 52px;
    margin: 0;
    padding: 3px 6px;
    border: 0;
    border-radius: 5px;
    background: var(--field);
    box-shadow: inset 0 0 0 0.5px var(--field-edge);
    font-variant-numeric: tabular-nums;
    line-height: 16px;
    text-align: right;
    appearance: textfield;
  }

  input::-webkit-inner-spin-button,
  input::-webkit-outer-spin-button {
    appearance: none;
    margin: 0;
  }

  input:focus-visible {
    outline: 3px solid var(--focus-ring);
    outline-offset: 0;
  }

  input[aria-invalid="true"] {
    box-shadow: inset 0 0 0 1px var(--danger);
  }

  input:disabled {
    color: var(--tertiary-label);
  }

  .stepper {
    display: inline-flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 5px;
    background: var(--control);
    box-shadow:
      0 0 0 0.5px var(--control-edge),
      var(--control-shadow);
  }

  .stepper button {
    display: grid;
    place-items: center;
    width: 14px;
    height: 11px;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--label);
  }

  .stepper button:active:not(:disabled) {
    background: var(--control-pressed);
  }

  .stepper button:disabled {
    color: var(--tertiary-label);
  }

  .stepper svg {
    width: 8px;
    height: 5px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .unit {
    min-width: 3ch;
  }

  input:disabled ~ .unit {
    color: var(--tertiary-label);
  }
</style>
