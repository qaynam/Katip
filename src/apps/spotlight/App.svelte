<script lang="ts">
  import { onMount } from "svelte"
  import type { ColorScheme, SpaceTheme } from "#modules/theme"
  import type { SpotlightResult } from "#protocol"
  import ResultRow from "./components/ResultRow.svelte"
  import SearchGlyph from "./components/SearchGlyph.svelte"
  import type { SpotlightConnection } from "./connection/spotlight-connection"
  import { spotlightAppearance } from "./logic/appearance"
  import type { FaviconResolver } from "./logic/favicon"
  import { isMatchedCandidate } from "./logic/result-display"
  import { stepSelection } from "./logic/selection"
  import { currentSystemScheme, watchSystemScheme } from "./state/system-scheme"
  import { strings } from "./strings"

  interface Props {
    connection: SpotlightConnection
    faviconUrl: FaviconResolver
    /** Spotlight のウィンドウを閉じる。 */
    close: () => void
  }

  const { connection, faviconUrl, close }: Props = $props()

  const RESULTS_ID = "spotlight-results"
  const optionId = (index: number) => `spotlight-option-${index}`

  let query = $state("")
  let results = $state.raw<ReadonlyArray<SpotlightResult>>([])
  let spaceTheme = $state.raw<SpaceTheme | null>(null)
  let selectedIndex = $state(0)
  let hasLoaded = $state(false)
  let isSearching = $state(false)
  let notice = $state<string | null>(null)
  let input = $state<HTMLInputElement>()
  let list = $state<HTMLElement>()

  let systemScheme = $state<ColorScheme>(currentSystemScheme())
  $effect(() => watchSystemScheme((scheme) => (systemScheme = scheme)))

  const appearance = $derived(spotlightAppearance(spaceTheme, systemScheme))
  const hasMatches = $derived(results.some(isMatchedCandidate))

  // 応答は入力した順に届くとは限らない。先に打った語の応答で、後の語の結果を上書きしない
  let latestSearch = 0
  const search = async (text: string) => {
    const ticket = ++latestSearch
    isSearching = true
    const response = await connection.search(text)
    if (ticket !== latestSearch) return
    isSearching = false
    if (response === null) {
      notice = strings.unreachable
      return
    }
    notice = null
    results = response.results
    spaceTheme = response.spaceTheme
    selectedIndex = 0
    hasLoaded = true
  }

  let isChoosing = false
  const choose = async (result: SpotlightResult | undefined) => {
    if (result === undefined || isChoosing) return
    isChoosing = true
    const outcome = await connection.choose(result)
    isChoosing = false
    if (outcome._tag === "Succeeded") close()
    else notice = outcome.reason
  }

  const onkeydown = (event: KeyboardEvent) => {
    // 日本語入力の変換中は、Enter や矢印キーを変換の確定と候補選びに使う
    if (event.isComposing) return
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault()
        selectedIndex = stepSelection(
          selectedIndex,
          results.length,
          event.key === "ArrowDown" ? 1 : -1,
        )
        return
      case "Enter":
        event.preventDefault()
        void choose(results[selectedIndex])
        return
      case "Escape":
        event.preventDefault()
        close()
        return
    }
  }

  $effect(() => {
    void results
    list?.querySelector(`#${optionId(selectedIndex)}`)?.scrollIntoView({ block: "nearest" })
  })

  onMount(() => {
    input?.focus()
    void search("")
  })
</script>

<svelte:window {onkeydown} onblur={close} />

<div
  class="spotlight"
  data-scheme={appearance.scheme}
  style:--background={appearance.background}
  style:--text={appearance.text}
  style:--text-muted={appearance.mutedText}
  style:--accent={appearance.accent}
  style:--divider={appearance.divider}
>
  <main class="panel">
    <div class="search">
      <span class="search-glyph"><SearchGlyph size={20} /></span>
      <input
        bind:this={input}
        class="query"
        type="text"
        role="combobox"
        aria-label={strings.searchLabel}
        aria-expanded="true"
        aria-controls={RESULTS_ID}
        aria-autocomplete="list"
        aria-activedescendant={results.length > 0 ? optionId(selectedIndex) : undefined}
        placeholder={strings.placeholder}
        autocomplete="off"
        spellcheck="false"
        value={query}
        oninput={(event) => {
          query = event.currentTarget.value
          void search(query)
        }}
      />
      <span class="spinner" class:visible={isSearching && hasLoaded} aria-hidden="true"></span>
    </div>

    <div class="body">
      {#if !hasLoaded}
        <p class="message" role="status">{strings.loading}</p>
      {:else if !hasMatches}
        <p class="message" role="status">
          {query.trim() === "" ? strings.noRecentTabs : strings.noMatches}
        </p>
      {/if}
      {#if results.length > 0}
        <div
          bind:this={list}
          id={RESULTS_ID}
          class="results"
          role="listbox"
          aria-label={strings.resultsLabel}
        >
          {#each results as result, index (index)}
            <ResultRow
              id={optionId(index)}
              {result}
              isSelected={index === selectedIndex}
              {faviconUrl}
              onchoose={() => choose(result)}
              onpoint={() => (selectedIndex = index)}
            />
          {/each}
        </div>
      {/if}
    </div>

    {#if notice !== null}
      <p class="notice" role="alert">{notice}</p>
    {/if}

    <footer class="hints" aria-hidden="true">
      <span><kbd>↑</kbd><kbd>↓</kbd>{strings.hints.select}</span>
      <span><kbd>↵</kbd>{strings.hints.open}</span>
      <span><kbd>esc</kbd>{strings.hints.close}</span>
    </footer>
  </main>
</div>

<style>
  .spotlight {
    --selected-surface: color-mix(in srgb, var(--accent) 24%, transparent);
    --icon-tile: color-mix(in srgb, var(--text) 8%, transparent);

    box-sizing: border-box;
    height: 100vh;
    padding: 10px;
    overflow: hidden;
    background: var(--background);
    color: var(--text);
    font-size: 13px;
    line-height: 1.35;
    -webkit-font-smoothing: antialiased;
  }

  .spotlight[data-scheme="light"] {
    color-scheme: light;
    --glass-bg: rgb(255 255 255 / 0.62);
    --glass-border: rgb(0 0 0 / 0.08);
    --glass-shadow: 0 14px 36px rgb(0 0 0 / 0.14), 0 2px 6px rgb(0 0 0 / 0.06);
  }

  .spotlight[data-scheme="dark"] {
    color-scheme: dark;
    --glass-bg: rgb(30 30 36 / 0.62);
    --glass-border: rgb(255 255 255 / 0.1);
    --glass-shadow: 0 16px 40px rgb(0 0 0 / 0.4), 0 2px 6px rgb(0 0 0 / 0.22);
  }

  .spotlight :global(*),
  .spotlight :global(*::before),
  .spotlight :global(*::after) {
    box-sizing: border-box;
  }

  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    border: 0.5px solid var(--glass-border);
    border-radius: 14px;
    background: var(--glass-bg);
    box-shadow: var(--glass-shadow);
    -webkit-backdrop-filter: blur(28px) saturate(1.6);
    backdrop-filter: blur(28px) saturate(1.6);
  }

  .search {
    display: flex;
    flex: none;
    align-items: center;
    gap: 12px;
    height: 60px;
    padding: 0 18px;
    border-bottom: 1px solid var(--divider);
  }

  .search-glyph {
    color: var(--text-muted);
  }

  .query {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 20px;
    font-weight: 500;
    caret-color: var(--accent);
  }

  .query::placeholder {
    color: var(--text-muted);
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 1.5px solid var(--divider);
    border-top-color: var(--text-muted);
    border-radius: 50%;
    opacity: 0;
    transition: opacity 120ms ease 120ms;
    animation: spin 700ms linear infinite;
  }

  .spinner.visible {
    opacity: 1;
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px;
  }

  .results {
    display: flex;
    flex-direction: column;
  }

  .message {
    margin: 0;
    padding: 12px 12px 8px;
    color: var(--text-muted);
  }

  .notice {
    flex: none;
    margin: 0;
    padding: 8px 18px;
    border-top: 1px solid var(--divider);
    color: var(--text);
    font-size: 12px;
  }

  .hints {
    display: flex;
    flex: none;
    gap: 16px;
    justify-content: flex-end;
    padding: 7px 14px;
    border-top: 1px solid var(--divider);
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .hints span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  kbd {
    display: inline-grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 5px;
    background: var(--icon-tile);
    font: inherit;
    font-size: 11px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
</style>
