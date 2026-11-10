<script lang="ts">
  import { Effect, Exit, Option, Stream } from "effect"
  import { type Bang, BangCatalog, searchBangs } from "#modules/bangs"
  import type { Translator } from "#modules/i18n"
  import {
    keyOfRef,
    keywordsExcept,
    type ListedSiteCommand,
    listedSiteCommands,
    searchesWithQuery,
    type SiteCommand,
    type SiteCommandDraft,
    SiteCommandId,
    type SiteCommandList,
    type SiteCommandRef,
    SiteCommands,
    withCommandAdded,
    withCommandEdited,
    withCommandRemoved,
    withDefaultsRestored,
  } from "#modules/site-commands"
  import type { OnboardingRuntime } from "../onboarding-runtime"
  import CommandForm from "./CommandForm.svelte"

  let {
    runtime,
    translator,
    faviconUrl,
    newId = () => SiteCommandId.make(crypto.randomUUID()),
  }: {
    runtime: OnboardingRuntime
    translator: Translator
    faviconUrl: (pageUrl: string) => string | null
    /** Makes the ID of a command being added. */
    newId?: () => SiteCommandId
  } = $props()

  const SITE_LIMIT = 6

  type Editing =
    { readonly _tag: "Adding" } | { readonly _tag: "Editing"; readonly command: ListedSiteCommand }

  let list = $state.raw<SiteCommandList | null>(null)
  let editing = $state.raw<Editing | null>(null)

  const t = $derived(translator.t)
  const commands = $derived(list === null ? [] : listedSiteCommands(list, translator))

  $effect(() =>
    runtime.runCallback(
      SiteCommands.use((siteCommands) =>
        Stream.runForEach(siteCommands.changes, (latest) =>
          Effect.sync(() => {
            list = latest
          }),
        ),
      ).pipe(Effect.ignore),
    ),
  )

  const save = async (change: (list: SiteCommandList) => SiteCommandList) => {
    const saved = await runtime.runPromiseExit(
      SiteCommands.use((siteCommands) => siteCommands.update(change)),
    )
    if (Exit.isSuccess(saved)) list = saved.value
    return Exit.isSuccess(saved)
  }

  // Unreadable, the list of bangs finds nothing, and the fields can still be typed in by hand
  const searchSites = (text: string): Promise<ReadonlyArray<Bang>> =>
    runtime.runPromise(
      BangCatalog.use((catalog) => catalog.contents).pipe(
        Effect.map(({ bangs }) => searchBangs(bangs, text, SITE_LIMIT)),
        Effect.orElseSucceed((): ReadonlyArray<Bang> => []),
      ),
    )

  const draftOf = (command: ListedSiteCommand): SiteCommandDraft => ({
    title: command.title,
    url: command.url,
    keyword: command.keyword ?? "",
  })

  const emptyDraft: SiteCommandDraft = { title: "", url: "", keyword: "" }

  const isEditing = (command: ListedSiteCommand) =>
    editing?._tag === "Editing" && keyOfRef(editing.command.ref) === keyOfRef(command.ref)

  const add = async (fields: Omit<SiteCommand, "id">) => {
    if (await save((current) => withCommandAdded(current, { id: newId(), ...fields }))) {
      editing = null
    }
  }

  // An added command keeps its ID; one Katip comes with becomes an added command with a new one
  const edit = async (ref: SiteCommandRef, fields: Omit<SiteCommand, "id">) => {
    const id = ref._tag === "Added" ? ref.id : newId()
    if (await save((current) => withCommandEdited(current, ref, { id, ...fields }))) {
      editing = null
    }
  }

  const remove = (ref: SiteCommandRef) => save((current) => withCommandRemoved(current, ref))

  const detailOf = (command: ListedSiteCommand) =>
    searchesWithQuery(command.url) || command.keyword !== null
      ? [command.keyword === null ? null : `!${command.keyword}`, command.url]
          .filter((part) => part !== null)
          .join(" · ")
      : command.url
</script>

{#snippet form(heading: string, initial: SiteCommandDraft, except: Option.Option<SiteCommandRef>)}
  <CommandForm
    {heading}
    {initial}
    takenKeywords={keywordsExcept(commands, except)}
    findsSites={Option.isNone(except)}
    {t}
    {faviconUrl}
    {searchSites}
    onsave={(fields) =>
      Option.match(except, { onNone: () => add(fields), onSome: (ref) => edit(ref, fields) })}
    oncancel={() => (editing = null)}
  />
{/snippet}

{#if list !== null}
  {@const current = list}
  <section class="panel" aria-label={t("options.commands.heading")}>
    <ul class="commands">
      {#each commands as command (keyOfRef(command.ref))}
        <li>
          {#if isEditing(command)}
            <div class="editing">
              {@render form(
                t("options.commands.editHeading"),
                draftOf(command),
                Option.some(command.ref),
              )}
            </div>
          {:else}
            {@const icon = faviconUrl(command.iconPageUrl)}
            <div class="command">
              <span class="tile" aria-hidden="true">
                {#if icon !== null}<img src={icon} alt="" width="16" height="16" />{/if}
              </span>
              <span class="text">
                <span class="title">{command.title}</span>
                <span class="detail">{detailOf(command)}</span>
              </span>
              <button
                type="button"
                class="text-button"
                aria-label={t("options.commands.editLabel", { title: command.title })}
                onclick={() => (editing = { _tag: "Editing", command })}
              >
                {t("options.commands.edit")}
              </button>
              <button
                type="button"
                class="text-button"
                aria-label={t("options.commands.removeLabel", { title: command.title })}
                onclick={() => remove(command.ref)}
              >
                {t("options.commands.remove")}
              </button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    {#if editing?._tag === "Adding"}
      {@render form(t("options.commands.newHeading"), emptyDraft, Option.none())}
    {/if}
    <div class="list-buttons">
      {#if editing?._tag !== "Adding"}
        <button
          type="button"
          class="button secondary"
          onclick={() => (editing = { _tag: "Adding" })}
        >
          {t("options.commands.add")}
        </button>
      {/if}
      {#if current.removedDefaults.length > 0}
        <button type="button" class="button secondary" onclick={() => save(withDefaultsRestored)}>
          {t("options.commands.restoreDefaults")}
        </button>
      {/if}
    </div>
  </section>
{/if}

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .commands {
    max-height: 16rem;
    margin: 0;
    padding: 0.25rem 0.75rem;
    overflow-y: auto;
    border-radius: 1rem;
    background: var(--stage);
    list-style: none;
  }

  .commands li + li {
    border-top: 1px solid var(--hairline);
  }

  .editing {
    padding: 0.5rem 0;
  }

  .command {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 3rem;
  }

  .tile {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 0.5rem;
    background: var(--surface);
  }

  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .title {
    font-weight: 500;
  }

  .detail {
    overflow: hidden;
    color: var(--ink-secondary);
    font-size: 0.8125rem;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .list-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.625rem;
  }
</style>
