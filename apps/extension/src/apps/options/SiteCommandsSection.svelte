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
  import type { OptionsRuntime } from "./options-runtime"
  import PushButton from "./PushButton.svelte"
  import SettingsSection from "./SettingsSection.svelte"
  import SiteCommandEditor from "./SiteCommandEditor.svelte"

  let {
    runtime,
    translator,
    faviconUrl,
    newId = () => SiteCommandId.make(crypto.randomUUID()),
    onsave,
  }: {
    runtime: OptionsRuntime
    translator: Translator
    faviconUrl: (pageUrl: string) => string | null
    /** Makes the ID of a command being added. */
    newId?: () => SiteCommandId
    /** Called once a change is saved or fails to be. */
    onsave: (saved: boolean) => void
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
    onsave(Exit.isSuccess(saved))
    return Exit.isSuccess(saved)
  }

  // The list is read the first time a site is looked up. Unreadable, it finds nothing, and the
  // fields can still be typed in by hand
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

{#snippet editor(heading: string, initial: SiteCommandDraft, except: Option.Option<SiteCommandRef>)}
  <SiteCommandEditor
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
  <SettingsSection
    heading={t("options.commands.heading")}
    footnote={t("options.commands.footnote")}
  >
    <ul class="commands">
      {#each commands as command (keyOfRef(command.ref))}
        <li>
          {#if isEditing(command)}
            {@render editor(
              t("options.commands.editHeading"),
              draftOf(command),
              Option.some(command.ref),
            )}
          {:else}
            {@const icon = faviconUrl(command.iconPageUrl)}
            <div class="command">
              <span class="tile" aria-hidden="true">
                {#if icon !== null}
                  <img src={icon} alt="" width="16" height="16" />
                {/if}
              </span>
              <span class="text">
                <span class="title">{command.title}</span>
                <span class="detail">{detailOf(command)}</span>
              </span>
              <span class="actions">
                <button
                  type="button"
                  aria-label={t("options.commands.editLabel", { title: command.title })}
                  onclick={() => (editing = { _tag: "Editing", command })}
                >
                  {t("options.commands.edit")}
                </button>
                <button
                  type="button"
                  aria-label={t("options.commands.removeLabel", { title: command.title })}
                  onclick={() => remove(command.ref)}
                >
                  {t("options.commands.remove")}
                </button>
              </span>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    {#if editing?._tag === "Adding"}
      {@render editor(t("options.commands.newHeading"), emptyDraft, Option.none())}
    {/if}
  </SettingsSection>

  <div class="list-buttons">
    {#if editing?._tag !== "Adding"}
      <PushButton onclick={() => (editing = { _tag: "Adding" })}>
        {t("options.commands.add")}
      </PushButton>
    {/if}
    {#if current.removedDefaults.length > 0}
      <PushButton onclick={() => save(withDefaultsRestored)}>
        {t("options.commands.restoreDefaults")}
      </PushButton>
    {/if}
  </div>
{/if}

<style>
  .commands {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .commands > li:not(:first-child) {
    border-top: 0.5px solid var(--divider);
  }

  .command {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 8px 0;
  }

  .tile {
    display: grid;
    flex: none;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--text) 8%, transparent);
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
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .title {
    font-size: 14px;
  }

  .detail {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 400;
  }

  .actions {
    display: flex;
    flex: none;
    gap: 2px;
  }

  .actions button {
    height: 26px;
    padding: 0 9px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-muted);
    font-size: 12.5px;
  }

  .actions button:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .list-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: -16px;
  }
</style>
