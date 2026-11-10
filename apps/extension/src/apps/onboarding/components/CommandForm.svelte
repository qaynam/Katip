<script lang="ts">
  import { onMount } from "svelte"
  import { type Bang, siteUrlOf } from "#modules/bangs"
  import type { Translator } from "#modules/i18n"
  import {
    checkDraft,
    type DraftProblem,
    type SiteCommand,
    type SiteCommandDraft,
  } from "#modules/site-commands"

  let {
    heading,
    initial,
    takenKeywords,
    findsSites,
    t,
    faviconUrl,
    searchSites,
    onsave,
    oncancel,
  }: {
    heading: string
    initial: SiteCommandDraft
    /** The keywords of the other commands. */
    takenKeywords: ReadonlySet<string>
    /** Whether to offer filling the command in from a site in the list of bangs. */
    findsSites: boolean
    t: Translator["t"]
    faviconUrl: (pageUrl: string) => string | null
    searchSites: (text: string) => Promise<ReadonlyArray<Bang>>
    onsave: (fields: Omit<SiteCommand, "id">) => void
    oncancel: () => void
  } = $props()

  const id = $props.id()
  const fieldId = (name: string) => `${id}-${name}`
  const problemId = (name: string) => `${id}-${name}-problem`

  // svelte-ignore state_referenced_locally
  let title = $state(initial.title)
  // svelte-ignore state_referenced_locally
  let url = $state(initial.url)
  // svelte-ignore state_referenced_locally
  let keyword = $state(initial.keyword)
  let siteQuery = $state("")
  let sites = $state.raw<ReadonlyArray<Bang> | null>(null)
  // Nothing is wrong with a field before the first try to save
  let triedSaving = $state(false)
  let siteField = $state<HTMLInputElement>()
  let titleField = $state<HTMLInputElement>()

  const checked = $derived(checkDraft({ title, url, keyword }, takenKeywords))
  const problems = $derived<ReadonlyArray<DraftProblem>>(
    triedSaving && checked._tag === "Invalid" ? checked.problems : [],
  )

  const problemMessages = {
    TitleMissing: "options.commands.problem.titleMissing",
    UrlInvalid: "options.commands.problem.urlInvalid",
    KeywordInvalid: "options.commands.problem.keywordInvalid",
    KeywordMissing: "options.commands.problem.keywordMissing",
    KeywordTaken: "options.commands.problem.keywordTaken",
  } as const satisfies Record<DraftProblem, string>

  const fieldProblems = {
    title: ["TitleMissing"],
    url: ["UrlInvalid"],
    keyword: ["KeywordInvalid", "KeywordMissing", "KeywordTaken"],
  } as const satisfies Record<string, ReadonlyArray<DraftProblem>>

  const problemOf = (field: keyof typeof fieldProblems): string | null => {
    const problem = problems.find((found) =>
      (fieldProblems[field] as ReadonlyArray<DraftProblem>).includes(found),
    )
    return problem === undefined ? null : t(problemMessages[problem])
  }

  // Typing can outrun the lookups, so only the latest one's answer is shown
  let latestLookup = 0
  const findSites = async (text: string) => {
    siteQuery = text
    const lookup = ++latestLookup
    const found = text.trim() === "" ? null : await searchSites(text)
    if (lookup === latestLookup) sites = found
  }

  // Of the site's triggers, the first no other command has. Left empty when every one is taken,
  // for one to be typed
  const fillFrom = (site: Bang) => {
    title = t("options.commands.searchTitle", { site: site.name })
    url = site.template
    keyword = site.triggers.find((trigger) => !takenKeywords.has(trigger)) ?? ""
    siteQuery = ""
    sites = null
  }

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    triedSaving = true
    if (checked._tag === "Valid") onsave(checked.fields)
  }

  // Escape anywhere in the form gives up the edit, the way it closes a dialog
  const cancelsOnEscape = (form: HTMLFormElement) => {
    const onkeydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return
      event.preventDefault()
      oncancel()
    }
    form.addEventListener("keydown", onkeydown)
    return () => form.removeEventListener("keydown", onkeydown)
  }

  onMount(() => (findsSites ? siteField : titleField)?.focus())
</script>

<form class="form" aria-label={heading} onsubmit={submit} {@attach cancelsOnEscape}>
  <h2>{heading}</h2>
  {#if findsSites}
    <div class="field">
      <label for={fieldId("site")}>{t("options.commands.field.site")}</label>
      <input
        bind:this={siteField}
        id={fieldId("site")}
        type="search"
        autocomplete="off"
        placeholder={t("options.commands.field.sitePlaceholder")}
        value={siteQuery}
        oninput={(event) => findSites(event.currentTarget.value)}
      />
      {#if sites !== null}
        {#if sites.length === 0}
          <p class="hint">{t("options.commands.noSites")}</p>
        {:else}
          <ul class="sites">
            {#each sites as site (site.triggers[0])}
              {@const icon = faviconUrl(siteUrlOf(site))}
              <li>
                <button type="button" class="site" onclick={() => fillFrom(site)}>
                  <span class="tile" aria-hidden="true">
                    {#if icon !== null}<img src={icon} alt="" width="16" height="16" />{/if}
                  </span>
                  <span class="site-name">{site.name}</span>
                  <span class="hint">!{site.triggers[0]}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  {/if}
  <div class="row">
    <div class="field">
      <label for={fieldId("title")}>{t("options.commands.field.title")}</label>
      <input
        bind:this={titleField}
        id={fieldId("title")}
        type="text"
        autocomplete="off"
        bind:value={title}
        aria-invalid={problemOf("title") !== null}
        aria-describedby={problemOf("title") === null ? undefined : problemId("title")}
      />
      {#if problemOf("title") !== null}
        <p id={problemId("title")} class="problem">{problemOf("title")}</p>
      {/if}
    </div>
    <div class="field keyword">
      <label for={fieldId("keyword")}>{t("options.commands.field.keyword")}</label>
      <input
        id={fieldId("keyword")}
        type="text"
        autocomplete="off"
        spellcheck="false"
        bind:value={keyword}
        aria-invalid={problemOf("keyword") !== null}
        aria-describedby={problemOf("keyword") === null ? undefined : problemId("keyword")}
      />
      {#if problemOf("keyword") !== null}
        <p id={problemId("keyword")} class="problem">{problemOf("keyword")}</p>
      {/if}
    </div>
  </div>
  <div class="field">
    <label for={fieldId("url")}>{t("options.commands.field.url")}</label>
    <input
      id={fieldId("url")}
      type="text"
      autocomplete="off"
      spellcheck="false"
      placeholder="https://"
      bind:value={url}
      aria-invalid={problemOf("url") !== null}
      aria-describedby="{fieldId('url')}-description{problemOf('url') === null
        ? ''
        : ` ${problemId('url')}`}"
    />
    <p id="{fieldId('url')}-description" class="hint">
      {t("options.commands.field.urlDescription")}
    </p>
    {#if problemOf("url") !== null}
      <p id={problemId("url")} class="problem">{problemOf("url")}</p>
    {/if}
  </div>
  <div class="buttons">
    <button type="button" class="button secondary" onclick={oncancel}>{t("common.cancel")}</button>
    <button type="submit" class="button primary">{t("options.commands.save")}</button>
  </div>
</form>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1.125rem;
    border-radius: 1rem;
    background: var(--stage);
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 10rem;
    gap: 0.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }

  label {
    font-size: 0.875rem;
    font-weight: 500;
  }

  input {
    box-sizing: border-box;
    width: 100%;
    height: 2.5rem;
    padding: 0 0.875rem;
    border: none;
    border-radius: 0.75rem;
    background: var(--surface);
    box-shadow: 0 0 0 1px var(--hairline);
    color: var(--ink);
    font: inherit;
    font-size: 0.9375rem;
  }

  input[aria-invalid="true"] {
    box-shadow: 0 0 0 1.5px var(--warning);
  }

  .hint,
  .problem {
    margin: 0;
    color: var(--ink-secondary);
    font-size: 0.8125rem;
  }

  .problem {
    color: var(--warning);
  }

  .sites {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0.25rem 0 0;
    padding: 0;
    list-style: none;
  }

  .site {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.4rem 0.6rem;
    border: none;
    border-radius: 0.625rem;
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .site:hover {
    background: var(--surface);
  }

  .tile {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.4rem;
    background: var(--surface);
  }

  .site-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .buttons {
    display: flex;
    gap: 0.625rem;
    justify-content: flex-end;
  }
</style>
