<script lang="ts">
  import { onMount } from "svelte"
  import type { Translator } from "#modules/i18n"
  import type { ColorScheme, SpaceTheme } from "#modules/theme"
  import type { SpotlightMode, SpotlightResult } from "#protocol"
  import ResultRow from "./components/ResultRow.svelte"
  import SearchGlyph from "./components/SearchGlyph.svelte"
  import type { SpotlightConnection } from "./connection/spotlight-connection"
  import { spotlightAppearance } from "./logic/appearance"
  import type { FaviconResolver } from "./logic/favicon"
  import { completionOf, isMatchedCandidate } from "./logic/result-display"
  import { selectionStepOf, stepSelection } from "./logic/selection"
  import { currentSystemScheme, watchSystemScheme } from "./state/system-scheme"

  interface Props {
    connection: SpotlightConnection
    faviconUrl: FaviconResolver
    /** Closes Spotlight's window. */
    close: () => void
    translator: Translator
  }

  const { connection, faviconUrl, close, translator }: Props = $props()
  const t = $derived(translator.t)

  const RESULTS_ID = "spotlight-results"
  const optionId = (index: number) => `spotlight-option-${index}`

  let query = $state("")
  let mode = $state<SpotlightMode>("All")
  let results = $state.raw<ReadonlyArray<SpotlightResult>>([])
  let spaceTheme = $state.raw<SpaceTheme | null>(null)
  let respondedAt = $state(Date.now())
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
  const selectedCompletion = $derived.by(() => {
    const selected = results[selectedIndex]
    return selected === undefined ? null : completionOf(selected)
  })

  // Responses may arrive out of order, and an earlier query's must not overwrite a later one's
  let latestSearch = 0
  const search = async (text: string, searchMode: SpotlightMode) => {
    const ticket = ++latestSearch
    isSearching = true
    const response = await connection.search(text, searchMode)
    if (ticket !== latestSearch) return
    isSearching = false
    if (response === null) {
      notice = t("spotlight.unreachable")
      return
    }
    notice = null
    respondedAt = Date.now()
    results = response.results
    spaceTheme = response.spaceTheme
    selectedIndex = 0
    hasLoaded = true
  }

  // What to search for is typed next, so the bang is filled in rather than anything opened
  const complete = (completion: string) => {
    mode = "All"
    query = completion
    input?.focus()
    void search(completion, "All")
  }

  let isChoosing = false
  const choose = async (result: SpotlightResult | undefined) => {
    if (result === undefined || isChoosing) return
    const completion = completionOf(result)
    if (completion !== null) {
      complete(completion)
      return
    }
    isChoosing = true
    const outcome = await connection.choose(result)
    isChoosing = false
    if (outcome === null) notice = t("spotlight.unreachable")
    else if (outcome._tag === "Succeeded") close()
    else notice = outcome.reason
  }

  const switchMode = (next: SpotlightMode) => {
    mode = next
    void search(query, next)
  }

  const hasModifier = (event: KeyboardEvent) =>
    event.shiftKey || event.altKey || event.ctrlKey || event.metaKey

  const onkeydown = (event: KeyboardEvent) => {
    // While an input method is composing, Enter and the arrow keys confirm text and pick candidates
    if (event.isComposing) return
    const step = selectionStepOf(event)
    if (step !== null) {
      event.preventDefault()
      selectedIndex = stepSelection(selectedIndex, results.length, step)
      return
    }
    switch (event.key) {
      case "Tab":
        if (hasModifier(event)) return
        if (selectedCompletion !== null) {
          event.preventDefault()
          complete(selectedCompletion)
          return
        }
        if (query !== "") return
        event.preventDefault()
        if (mode === "All") switchMode("Actions")
        return
      case "Backspace":
        if (mode !== "Actions" || query !== "") return
        event.preventDefault()
        switchMode("All")
        return
      case "Enter":
        event.preventDefault()
        void choose(results[selectedIndex])
        return
      case "Escape":
        event.preventDefault()
        if (mode === "Actions") switchMode("All")
        else close()
        return
    }
  }

  $effect(() => {
    void results
    list?.querySelector(`#${optionId(selectedIndex)}`)?.scrollIntoView({ block: "nearest" })
  })

  onMount(() => {
    input?.focus()
    void search(query, mode)
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
      {#if mode === "Actions"}
        <span class="mode-chip">{t("spotlight.commands.badge")}</span>
      {/if}
      <input
        bind:this={input}
        class="query"
        type="text"
        role="combobox"
        aria-label={mode === "Actions"
          ? t("spotlight.commands.label")
          : t("spotlight.search.label")}
        aria-expanded="true"
        aria-controls={RESULTS_ID}
        aria-autocomplete="list"
        aria-activedescendant={results.length > 0 ? optionId(selectedIndex) : undefined}
        placeholder={mode === "Actions"
          ? t("spotlight.commands.placeholder")
          : t("spotlight.search.placeholder")}
        autocomplete="off"
        spellcheck="false"
        value={query}
        oninput={(event) => {
          query = event.currentTarget.value
          void search(query, mode)
        }}
      />
      <span class="spinner" class:visible={isSearching && hasLoaded} aria-hidden="true"></span>
    </div>

    <div class="body">
      {#if !hasLoaded}
        <p class="message" role="status">{t("spotlight.loading")}</p>
      {:else if !hasMatches}
        <p class="message" role="status">
          {mode === "Actions"
            ? t("spotlight.empty.noMatchingCommands")
            : query.trim() === ""
              ? t("spotlight.empty.noRecentTabs")
              : t("spotlight.empty.noMatches")}
        </p>
      {/if}
      {#if results.length > 0}
        <div
          bind:this={list}
          id={RESULTS_ID}
          class="results"
          role="listbox"
          aria-label={t("spotlight.results.label")}
        >
          {#each results as result, index (index)}
            <ResultRow
              id={optionId(index)}
              {result}
              isSelected={index === selectedIndex}
              now={respondedAt}
              {translator}
              showsKind={mode === "All"}
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
      {#if selectedCompletion !== null}
        <span><kbd>tab</kbd>{t("spotlight.hint.complete")}</span>
      {:else if mode === "All" && query === ""}
        <span><kbd>tab</kbd>{t("spotlight.hint.commands")}</span>
      {/if}
      <span><kbd>↑</kbd><kbd>↓</kbd>{t("spotlight.hint.select")}</span>
      <span><kbd>↵</kbd>{t("spotlight.hint.open")}</span>
      <span><kbd>esc</kbd>{mode === "Actions" ? t("spotlight.hint.back") : t("common.close")}</span>
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

  .mode-chip {
    flex: none;
    padding: 3px 8px;
    border-radius: 6px;
    background: var(--selected-surface);
    color: var(--text);
    font-size: 12.5px;
    font-weight: 600;
    line-height: 1.3;
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
