<script lang="ts">
  import type { Translator } from "#modules/i18n"
  import type { SpotlightResult } from "#protocol"
  import type { FaviconResolver } from "../logic/favicon"
  import { displayOf } from "../logic/result-display"
  import ResultIcon from "./ResultIcon.svelte"

  interface Props {
    id: string
    result: SpotlightResult
    isSelected: boolean
    /** 履歴の「何日前」を数える基準の時刻（エポックミリ秒）。 */
    now: number
    translator: Translator
    /** 右端に種類を出すか。どの行も同じ種類と分かっているときは出さない。 */
    showsKind?: boolean
    faviconUrl: FaviconResolver
    onchoose: () => void
    /** マウスで指したとき。選択をこの行へ移す。 */
    onpoint: () => void
  }

  const {
    id,
    result,
    isSelected,
    now,
    translator,
    showsKind = true,
    faviconUrl,
    onchoose,
    onpoint,
  }: Props = $props()
  const display = $derived(displayOf(result, now, translator))
</script>

<!-- キーボードでは入力欄から aria-activedescendant で操作するので、押しても入力欄からフォーカスを奪わない -->
<button
  {id}
  class="row"
  class:selected={isSelected}
  type="button"
  role="option"
  tabindex="-1"
  aria-selected={isSelected}
  onpointermove={onpoint}
  onmousedown={(event) => event.preventDefault()}
  onclick={onchoose}
>
  <ResultIcon icon={display.icon} {faviconUrl} />
  <span class="text">
    <span class="title">{display.title}</span>
    {#if display.detail !== ""}
      <span class="detail">{display.detail}</span>
    {/if}
  </span>
  {#if showsKind}
    <span class="kind">{display.kindLabel}</span>
  {/if}
  {#if display.shortcut !== null}
    <kbd class="shortcut">{display.shortcut}</kbd>
  {/if}
</button>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 48px;
    padding: 6px 12px 6px 10px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: default;
    user-select: none;
  }

  .row.selected {
    background: var(--selected-surface);
  }

  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .title,
  .detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title {
    font-size: 14px;
    font-weight: 600;
  }

  .detail {
    color: var(--text-muted);
    font-size: 12px;
  }

  .kind {
    flex: none;
    color: var(--text-muted);
    font-size: 11.5px;
    font-weight: 500;
  }

  .row.selected .kind {
    color: var(--text);
  }

  .shortcut {
    flex: none;
    padding: 1px 6px;
    border: 0.5px solid var(--divider);
    border-radius: 5px;
    color: var(--text-muted);
    font: inherit;
    font-size: 11.5px;
    letter-spacing: 0.04em;
  }

  .row.selected .shortcut {
    color: var(--text);
  }
</style>
