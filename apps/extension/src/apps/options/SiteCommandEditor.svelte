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
  import type { PlainMessageKey } from "./plain-message-key"

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
  } as const satisfies Record<DraftProblem, PlainMessageKey>

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

  const describedBy = (...ids: ReadonlyArray<string | null>) =>
    ids.filter((described) => described !== null).join(" ") || undefined

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

<form class="editor" aria-label={heading} novalidate onsubmit={submit} {@attach cancelsOnEscape}>
  <h4>{heading}</h4>

  {#if findsSites}
    <div class="field">
      <label for={fieldId("site")}>{t("options.commands.field.site")}</label>
      <input
        bind:this={siteField}
        id={fieldId("site")}
        type="search"
        autocomplete="off"
        spellcheck="false"
        placeholder={t("options.commands.field.sitePlaceholder")}
        aria-describedby={fieldId("site-description")}
        value={siteQuery}
        oninput={(event) => findSites(event.currentTarget.value)}
      />
      <p id={fieldId("site-description")} class="description">
        {t("options.commands.field.siteDescription")}
      </p>
      {#if sites !== null}
        {#if sites.length === 0}
          <p class="description" role="status">{t("options.commands.noSites")}</p>
        {:else}
          <ul class="sites">
            {#each sites as site (site.triggers[0])}
              {@const icon = faviconUrl(siteUrlOf(site))}
              <li>
                <button type="button" class="site" onclick={() => fillFrom(site)}>
                  <span class="tile" aria-hidden="true">
                    {#if icon !== null}
                      <img src={icon} alt="" width="16" height="16" />
                    {/if}
                  </span>
                  <span class="site-name">{site.name}</span>
                  <span class="site-detail">!{site.triggers[0]}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  {/if}

  <div class="field">
    <label for={fieldId("title")}>{t("options.commands.field.title")}</label>
    <input
      bind:this={titleField}
      id={fieldId("title")}
      type="text"
      autocomplete="off"
      aria-invalid={problemOf("title") !== null}
      aria-describedby={describedBy(problemOf("title") === null ? null : problemId("title"))}
      bind:value={title}
    />
    {#if problemOf("title") !== null}
      <p id={problemId("title")} class="problem">{problemOf("title")}</p>
    {/if}
  </div>

  <div class="field">
    <label for={fieldId("url")}>{t("options.commands.field.url")}</label>
    <input
      id={fieldId("url")}
      type="url"
      autocomplete="off"
      spellcheck="false"
      placeholder="https://"
      aria-invalid={problemOf("url") !== null}
      aria-describedby={describedBy(
        fieldId("url-description"),
        problemOf("url") === null ? null : problemId("url"),
      )}
      bind:value={url}
    />
    <p id={fieldId("url-description")} class="description">
      {t("options.commands.field.urlDescription")}
    </p>
    {#if problemOf("url") !== null}
      <p id={problemId("url")} class="problem">{problemOf("url")}</p>
    {/if}
  </div>

  <div class="field">
    <label for={fieldId("keyword")}>{t("options.commands.field.keyword")}</label>
    <div class="keyword">
      <span class="bang" aria-hidden="true">!</span>
      <input
        id={fieldId("keyword")}
        type="text"
        autocomplete="off"
        spellcheck="false"
        aria-invalid={problemOf("keyword") !== null}
        aria-describedby={describedBy(
          fieldId("keyword-description"),
          problemOf("keyword") === null ? null : problemId("keyword"),
        )}
        bind:value={keyword}
      />
    </div>
    <p id={fieldId("keyword-description")} class="description">
      {t("options.commands.field.keywordDescription")}
    </p>
    {#if problemOf("keyword") !== null}
      <p id={problemId("keyword")} class="problem">{problemOf("keyword")}</p>
    {/if}
  </div>

  <div class="buttons">
    <button type="button" onclick={oncancel}>{t("common.cancel")}</button>
    <button type="submit">{t("options.commands.save")}</button>
  </div>
</form>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin: 6px 0;
    padding: 16px;
    border: 0.5px solid var(--divider);
    border-radius: 10px;
    background: var(--surface-raised);
  }

  h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  label {
    font-size: 12.5px;
    font-weight: 600;
  }

  input {
    box-sizing: border-box;
    width: 100%;
    height: 30px;
    padding: 0 10px;
    border: 0.5px solid var(--control-edge);
    border-radius: 7px;
    background: var(--control-face);
    box-shadow: var(--control-depth);
    font-weight: 400;
  }

  input[aria-invalid="true"] {
    border-color: var(--danger);
  }

  .keyword {
    position: relative;
  }

  .bang {
    position: absolute;
    top: 50%;
    left: 10px;
    color: var(--text-muted);
    transform: translateY(-50%);
    pointer-events: none;
  }

  .keyword input {
    padding-left: 20px;
  }

  .description,
  .problem {
    max-width: 60ch;
    margin: 0;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.5;
  }

  .description {
    color: var(--text-muted);
  }

  .problem {
    color: var(--danger);
  }

  .sites {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 2px 0 0;
    padding: 0;
    list-style: none;
  }

  .site {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 34px;
    padding: 0 8px;
    border: none;
    border-radius: 7px;
    background: none;
    text-align: start;
  }

  .site:hover,
  .site:focus-visible {
    background: var(--surface-hover);
  }

  .tile {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--text) 8%, transparent);
  }

  .site-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .site-detail {
    flex: none;
    color: var(--text-muted);
    font-size: 12px;
  }

  .buttons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .buttons button {
    height: 28px;
    padding: 0 14px;
    border: 0.5px solid var(--control-edge);
    border-radius: 8px;
    background: var(--control-face);
    box-shadow: var(--control-depth);
    white-space: nowrap;
  }

  .buttons button:active {
    opacity: 0.7;
  }
</style>
