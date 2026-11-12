<script lang="ts">
  import "./theme.css"
  import { Effect, Exit, Stream } from "effect"
  import {
    languageTagOf,
    Locale,
    type LocalePreference,
    makeTranslator,
    type MessageKey,
    nativeLanguageNames,
    resolveLocale,
  } from "#modules/i18n"
  import {
    applySettingsPatch,
    idleDurationOf,
    idleMinutesChoicesWith,
    SettingsRepository,
    type Settings,
    type SettingsPatch,
  } from "#modules/settings"
  import { appearanceOf, type ColorScheme } from "#modules/theme"
  import { Updates, type UpdateStatus } from "#modules/updates"
  import { Tabs } from "#platform/browser"
  import { KeyboardShortcuts, openChromeShortcutSettings } from "#platform/keyboard-shortcuts"
  import { onboardingPageUrl } from "#protocol"
  import {
    CATEGORIES,
    type Category,
    categoryLooks,
    categoryOfFragment,
    SETTINGS_THEME,
  } from "./categories"
  import CategoryTabs from "./CategoryTabs.svelte"
  import { downloadExportFile } from "./data-export"
  import DataImport from "./DataImport.svelte"
  import FrameBackdrop from "./FrameBackdrop.svelte"
  import Glyph from "./Glyph.svelte"
  import { OptionalPermissions } from "./optional-permissions"
  import type { OptionsRuntime } from "./options-runtime"
  import PopUpButton, { type PopUpOption } from "./PopUpButton.svelte"
  import PushButton from "./PushButton.svelte"
  import SettingRow from "./SettingRow.svelte"
  import SettingsSection from "./SettingsSection.svelte"
  import SiteCommandsSection from "./SiteCommandsSection.svelte"
  import SpotlightPositionSetting from "./SpotlightPositionSetting.svelte"
  import SpotlightSizePicker from "./SpotlightSizePicker.svelte"
  import { CURRENT_TAB_COMMANDS, OPEN_AND_MOVE_COMMANDS } from "./shortcut-commands"
  import ShortcutRow from "./ShortcutRow.svelte"
  import StatusNote, { type Note } from "./StatusNote.svelte"
  import Switch from "./Switch.svelte"
  import { currentSystemScheme, watchSystemScheme } from "./system-scheme"

  let {
    runtime,
    version,
    releasedAt,
    repositoryUrl,
    browserLanguages,
    faviconUrl,
  }: {
    runtime: OptionsRuntime
    version: string
    /** When the running version was released, in ISO 8601. Null when unknown. */
    releasedAt: string | null
    repositoryUrl: string | null
    /** BCP 47 language tags in order of preference, like `navigator.languages`. */
    browserLanguages: ReadonlyArray<string>
    /** Makes a favicon image URL from a page URL. Null where none can be made. */
    faviconUrl: (pageUrl: string) => string | null
  } = $props()

  type Outcome =
    | "Saved"
    | "SaveFailed"
    | "ShortcutsUnavailable"
    | "HistoryDenied"
    | "Exported"
    | "ExportFailed"
    | "Imported"
    | "ImportFailed"

  const outcomeNotes = {
    Saved: { message: "options.saved", tone: "Done" },
    SaveFailed: { message: "options.saveFailed", tone: "Alert" },
    ShortcutsUnavailable: { message: "options.shortcuts.openFailed", tone: "Alert" },
    HistoryDenied: { message: "options.spotlight.history.denied", tone: "Info" },
    Exported: { message: "options.data.exported", tone: "Done" },
    ExportFailed: { message: "options.data.exportFailed", tone: "Alert" },
    Imported: { message: "options.data.imported", tone: "Done" },
    ImportFailed: { message: "options.data.importFailed", tone: "Alert" },
  } as const satisfies Record<Outcome, { message: MessageKey; tone: Note["tone"] }>

  const id = $props.id()
  const titleId = `${id}-title`
  const panelId = `${id}-panel`
  const tabIdOf = (category: Category) => `${id}-tab-${categoryLooks[category].slug}`

  let selected = $state<Category>(categoryOfFragment(location.hash) ?? CATEGORIES[0])
  let settings = $state<Settings | null>(null)
  let loadFailed = $state(false)
  let supportsSplitView = $state<boolean | null>(null)
  let searchesHistory = $state<boolean | null>(null)
  let assignedKeys = $state<ReadonlyMap<string, string> | null>(null)
  let systemScheme = $state<ColorScheme>(currentSystemScheme())
  let outcome = $state<Outcome | null>(null)
  let isExporting = $state(false)
  let hideDoneNoteTimer: ReturnType<typeof setTimeout> | undefined

  type UpdateCheck =
    | { readonly _tag: "NotChecked" }
    | { readonly _tag: "Checking" }
    | { readonly _tag: "Checked"; readonly status: UpdateStatus }
    | { readonly _tag: "Failed" }
    | { readonly _tag: "Limited"; readonly until: number }
  let updateCheck = $state.raw<UpdateCheck>({ _tag: "NotChecked" })

  const translator = $derived(
    makeTranslator(resolveLocale(settings?.locale ?? "auto", browserLanguages)),
  )
  const t = $derived(translator.t)

  const note = $derived<Note | null>(
    outcome === null
      ? null
      : { text: t(outcomeNotes[outcome].message), tone: outcomeNotes[outcome].tone },
  )

  const languageOptions = $derived<ReadonlyArray<PopUpOption<LocalePreference>>>([
    {
      value: "auto",
      label: t("options.language.automatic", {
        language: translator.languageName(resolveLocale("auto", browserLanguages)),
      }),
    },
    ...Locale.literals.map((locale) => ({
      value: locale,
      label: nativeLanguageNames[locale],
      lang: languageTagOf(locale),
    })),
  ])

  const appearance = $derived(appearanceOf(SETTINGS_THEME, systemScheme))

  const dateOf = (isoDate: string) =>
    new Intl.DateTimeFormat(translator.languageTag, { dateStyle: "long" }).format(new Date(isoDate))

  const timeOf = (epochMillis: number) =>
    new Intl.DateTimeFormat(translator.languageTag, { timeStyle: "short" }).format(epochMillis)

  const availableRelease = $derived(
    updateCheck._tag === "Checked" && updateCheck.status._tag === "Available"
      ? updateCheck.status.release
      : null,
  )

  const updateNote = $derived.by((): string | undefined => {
    switch (updateCheck._tag) {
      case "NotChecked":
        return undefined
      case "Checking":
        return t("options.updates.checking")
      case "Failed":
        return t("options.updates.failed")
      case "Limited":
        return t("options.updates.limited", { time: timeOf(updateCheck.until) })
      case "Checked":
        return updateCheck.status._tag === "UpToDate"
          ? t("options.updates.upToDate")
          : t("options.updates.available", { version: updateCheck.status.release.version })
    }
  })

  /** `null` when no key is assigned, `undefined` while the assigned keys aren't known. */
  const keyOf = (command: string): string | null | undefined =>
    assignedKeys === null ? undefined : (assignedKeys.get(command) ?? null)

  $effect(() => watchSystemScheme((scheme) => (systemScheme = scheme)))

  // Paint the whole document so the overscroll area past the page's edges has the same color
  $effect(() => {
    const root = document.documentElement
    root.lang = translator.languageTag
    root.style.colorScheme = appearance.scheme
    root.style.background = appearance.background
  })

  $effect(() =>
    runtime.runCallback(
      Tabs.use((tabs) =>
        Effect.sync(() => {
          supportsSplitView = tabs.supportsSplitView
        }),
      ),
    ),
  )

  $effect(() =>
    runtime.runCallback(
      OptionalPermissions.use((permissions) =>
        Stream.runForEach(Stream.merge(Stream.succeed(undefined), permissions.changes), () =>
          permissions.contains("History").pipe(
            Effect.tap((allowed) =>
              Effect.sync(() => {
                searchesHistory = allowed
              }),
            ),
            Effect.ignore,
          ),
        ),
      ),
    ),
  )

  const readAssignedKeys = () =>
    runtime.runCallback(
      KeyboardShortcuts.use((shortcuts) => shortcuts.assigned).pipe(
        Effect.tap((keys) =>
          Effect.sync(() => {
            assignedKeys = keys
          }),
        ),
        Effect.ignore,
      ),
    )

  // The browser reports no event when keys are changed on its shortcuts page, which opens in
  // another tab. Read them again whenever this page comes back into view
  $effect(() => {
    const cancel = readAssignedKeys()
    const readWhenVisible = () => {
      if (document.visibilityState === "visible") readAssignedKeys()
    }
    document.addEventListener("visibilitychange", readWhenVisible)
    return () => {
      cancel()
      document.removeEventListener("visibilitychange", readWhenVisible)
    }
  })

  $effect(() => {
    const cancel = runtime.runCallback(
      SettingsRepository.use((repository) =>
        Stream.runForEach(repository.changes, (latest) =>
          Effect.sync(() => {
            settings = latest
          }),
        ),
      ).pipe(
        Effect.catch(() =>
          Effect.sync(() => {
            loadFailed = settings === null
          }),
        ),
      ),
    )
    return () => {
      cancel()
      clearTimeout(hideDoneNoteTimer)
    }
  })

  $effect(() => {
    const openFragmentCategory = () => {
      const category = categoryOfFragment(location.hash)
      if (category !== null) selected = category
    }
    window.addEventListener("hashchange", openFragmentCategory)
    return () => window.removeEventListener("hashchange", openFragmentCategory)
  })

  // Not by assigning location.hash: that adds a history entry per category, so Back would step
  // through categories instead of leaving the page
  const select = (category: Category) => {
    selected = category
    history.replaceState(null, "", `#${categoryLooks[category].slug}`)
    document.documentElement.scrollTop = 0
  }

  const announce = (next: Outcome) => {
    clearTimeout(hideDoneNoteTimer)
    outcome = next
    if (outcomeNotes[next].tone === "Done") {
      hideDoneNoteTimer = setTimeout(() => (outcome = null), 2000)
    }
  }

  // A checkbox has already flipped in the DOM by the time it's clicked. Changing the state only
  // after saving would leave nothing to change back on failure, so the checkbox would stay flipped
  const saveOver = async (beforeSave: Settings, patch: SettingsPatch) => {
    settings = applySettingsPatch(beforeSave, patch)
    const saved = await runtime.runPromiseExit(
      SettingsRepository.use((repository) => repository.update(patch)),
    )
    if (Exit.isSuccess(saved)) {
      settings = saved.value
      announce("Saved")
    } else {
      settings = beforeSave
      announce("SaveFailed")
    }
  }

  const save = (patch: SettingsPatch) => (settings === null ? undefined : saveOver(settings, patch))

  const setHistorySearch = async (enabled: boolean) => {
    searchesHistory = enabled
    const allowed = await runtime.runPromiseExit(
      OptionalPermissions.use((permissions) =>
        Effect.andThen(
          enabled ? permissions.request("History") : permissions.remove("History"),
          permissions.contains("History"),
        ),
      ),
    )
    if (Exit.isFailure(allowed)) {
      searchesHistory = !enabled
      announce("SaveFailed")
      return
    }
    searchesHistory = allowed.value
    if (allowed.value === enabled) announce("Saved")
    else announce(enabled ? "HistoryDenied" : "SaveFailed")
  }

  const openShortcutSettings = async () => {
    const opened = await runtime.runPromiseExit(openChromeShortcutSettings)
    if (Exit.isFailure(opened)) announce("ShortcutsUnavailable")
  }

  const checkForUpdates = async () => {
    updateCheck = { _tag: "Checking" }
    const checked = await runtime.runPromiseExit(
      Updates.use((updates) => updates.check).pipe(
        Effect.map((status): UpdateCheck => ({ _tag: "Checked", status })),
        Effect.catchTag("UpdateCheckLimited", ({ until }) =>
          Effect.succeed<UpdateCheck>({ _tag: "Limited", until }),
        ),
      ),
    )
    updateCheck = Exit.isSuccess(checked) ? checked.value : { _tag: "Failed" }
  }

  const showTour = () =>
    void runtime.runPromise(
      Tabs.use((tabs) => tabs.create({ url: onboardingPageUrl(location.origin) })),
    )

  const exportData = async () => {
    isExporting = true
    const exported = await runtime.runPromiseExit(downloadExportFile)
    isExporting = false
    announce(Exit.isSuccess(exported) ? "Exported" : "ExportFailed")
  }
</script>

<svelte:head>
  <title>{t("options.documentTitle")}</title>
</svelte:head>

<div
  class="katip-options"
  data-scheme={appearance.scheme}
  style:--text={appearance.text}
  style:--text-muted={appearance.mutedText}
  style:--surface-hover={appearance.hoverSurface}
  style:--surface-raised={appearance.raisedSurface}
  style:--surface-active={appearance.activeSurface}
  style:--divider={appearance.divider}
  style:--accent={appearance.accent}
>
  <FrameBackdrop {appearance} />

  <header class="side">
    <h1 id={titleId}>{t("options.title")}</h1>
    <CategoryTabs
      {selected}
      labelOf={(category) => t(categoryLooks[category].heading)}
      labelledBy={titleId}
      {tabIdOf}
      {panelId}
      onselect={select}
    />
    <div class="status-slot"><StatusNote {note} /></div>
  </header>

  <main class="sheet">
    <div id={panelId} class="pane" role="tabpanel" aria-labelledby={tabIdOf(selected)} tabindex="0">
      <div class="pane-header">
        <h2>{t(categoryLooks[selected].heading)}</h2>
        {#if selected === "Shortcuts"}
          <PushButton onclick={openShortcutSettings}>
            {t("options.shortcuts.open")}
            <Glyph name="external" size={13} />
          </PushButton>
        {/if}
      </div>

      {#if settings !== null}
        {@const current = settings}
        {#if selected === "General"}
          <SettingsSection footnote={t("options.language.footnote")}>
            <SettingRow label={t("options.language.label")}>
              {#snippet children(control)}
                <PopUpButton
                  {...control}
                  value={current.locale}
                  options={languageOptions}
                  onchange={(locale) => save({ locale })}
                />
              {/snippet}
            </SettingRow>
          </SettingsSection>

          <SettingsSection heading={t("options.about.heading")}>
            <SettingRow
              label={t("options.version.label")}
              description={releasedAt === null
                ? undefined
                : t("options.version.released", { date: dateOf(releasedAt) })}
              labelsControl={false}
            >
              {#snippet children(control)}
                <span {...control} class="value">{version}</span>
              {/snippet}
            </SettingRow>
            <SettingRow
              label={t("options.updates.label")}
              description={updateNote}
              labelsControl={false}
            >
              {#snippet children(control)}
                {#if availableRelease !== null}
                  <a
                    {...control}
                    class="value link"
                    href={availableRelease.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("options.updates.openRelease")}
                    <Glyph name="external" size={12} />
                  </a>
                {:else}
                  <PushButton
                    {...control}
                    disabled={updateCheck._tag === "Checking"}
                    onclick={checkForUpdates}
                  >
                    {t("options.updates.check")}
                  </PushButton>
                {/if}
              {/snippet}
            </SettingRow>
            <SettingRow
              label={t("options.updates.automatic.label")}
              description={t("options.updates.automatic.description")}
            >
              {#snippet children(control)}
                <Switch
                  {...control}
                  checked={current.checkForUpdates}
                  onchange={(checked) => save({ checkForUpdates: checked })}
                />
              {/snippet}
            </SettingRow>
            <SettingRow label={t("options.welcome.label")} labelsControl={false}>
              {#snippet children(control)}
                <PushButton {...control} onclick={showTour}>{t("options.welcome.open")}</PushButton>
              {/snippet}
            </SettingRow>
            {#if repositoryUrl !== null}
              <SettingRow label={t("options.github.label")} labelsControl={false}>
                {#snippet children(control)}
                  <a
                    {...control}
                    class="value link"
                    href={repositoryUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {repositoryUrl.replace(/^https?:\/\//, "")}
                    <Glyph name="external" size={12} />
                  </a>
                {/snippet}
              </SettingRow>
            {/if}
          </SettingsSection>
        {:else if selected === "Tabs"}
          <SettingsSection>
            <SettingRow
              label={t("options.newTabsOnTop.label")}
              description={t("options.newTabsOnTop.description")}
            >
              {#snippet children(control)}
                <Switch
                  {...control}
                  checked={current.newTabsOnTop}
                  onchange={(checked) => save({ newTabsOnTop: checked })}
                />
              {/snippet}
            </SettingRow>
            <SettingRow
              label={t("options.collapsedFolders.label")}
              description={t("options.collapsedFolders.description")}
            >
              {#snippet children(control)}
                <Switch
                  {...control}
                  checked={current.showAllOpenTabsInCollapsedFolders}
                  onchange={(checked) => save({ showAllOpenTabsInCollapsedFolders: checked })}
                />
              {/snippet}
            </SettingRow>
            <SettingRow
              label={t("options.syncTabGroups.label")}
              description={t("options.syncTabGroups.description")}
            >
              {#snippet children(control)}
                <Switch
                  {...control}
                  checked={current.syncTabGroups}
                  onchange={(checked) => save({ syncTabGroups: checked })}
                />
              {/snippet}
            </SettingRow>
            {#if supportsSplitView !== null}
              <SettingRow label={t("options.splitView.label")} labelsControl={false}>
                {#snippet children(control)}
                  <span {...control} class="value">
                    {supportsSplitView
                      ? t("options.splitView.available")
                      : t("options.splitView.unavailable")}
                  </span>
                {/snippet}
              </SettingRow>
            {/if}
          </SettingsSection>
        {:else if selected === "Archive"}
          <SettingsSection footnote={t("options.autoArchive.footnote")}>
            <SettingRow label={t("options.autoArchive.label")}>
              {#snippet children(control)}
                <Switch
                  {...control}
                  checked={current.autoArchive.enabled}
                  onchange={(enabled) => save({ autoArchive: { enabled } })}
                />
              {/snippet}
            </SettingRow>
            <SettingRow
              label={t("options.autoArchive.idleTime.label")}
              disabled={!current.autoArchive.enabled}
            >
              {#snippet children(control)}
                <PopUpButton
                  {...control}
                  value={current.autoArchive.idleMinutes}
                  options={idleMinutesChoicesWith(current.autoArchive.idleMinutes).map(
                    (minutes) => ({
                      value: minutes,
                      label: translator.duration(idleDurationOf(minutes)),
                    }),
                  )}
                  disabled={!current.autoArchive.enabled}
                  onchange={(idleMinutes) => save({ autoArchive: { idleMinutes } })}
                />
              {/snippet}
            </SettingRow>
          </SettingsSection>
        {:else if selected === "Spotlight"}
          <SettingsSection footnote={t("options.spotlight.size.footnote")}>
            <SpotlightSizePicker
              legend={t("options.spotlight.size.label")}
              value={current.spotlightSize}
              labelOf={(size) => t(`options.spotlight.size.${size}`)}
              onchange={(spotlightSize) => save({ spotlightSize })}
            />
          </SettingsSection>
          <SettingsSection>
            <SpotlightPositionSetting
              {runtime}
              {t}
              size={current.spotlightSize}
              value={current.spotlightPosition}
              onchange={(spotlightPosition) => save({ spotlightPosition })}
            />
          </SettingsSection>
          {#if searchesHistory !== null}
            <SettingsSection footnote={t("options.spotlight.history.footnote")}>
              <SettingRow label={t("options.spotlight.history.label")}>
                {#snippet children(control)}
                  <Switch
                    {...control}
                    checked={searchesHistory === true}
                    onchange={setHistorySearch}
                  />
                {/snippet}
              </SettingRow>
            </SettingsSection>
          {/if}
          <SettingsSection footnote={t("options.spotlight.bangs.footnote")}>
            <SettingRow label={t("options.spotlight.bangs.label")}>
              {#snippet children(control)}
                <Switch
                  {...control}
                  checked={current.bangs}
                  onchange={(bangs) => save({ bangs })}
                />
              {/snippet}
            </SettingRow>
          </SettingsSection>
          <SiteCommandsSection
            {runtime}
            {translator}
            {faviconUrl}
            onsave={(saved) => announce(saved ? "Saved" : "SaveFailed")}
          />
        {:else if selected === "Shortcuts"}
          <p class="lede">{t("options.shortcuts.intro")}</p>
          <SettingsSection heading={t("options.shortcuts.openAndMove.heading")} listsTerms>
            {#each OPEN_AND_MOVE_COMMANDS as command (command.name)}
              <ShortcutRow
                label={t(command.label)}
                shortcut={keyOf(command.name)}
                notSetLabel={t("options.shortcuts.notSet")}
              />
            {/each}
          </SettingsSection>
          <SettingsSection
            heading={t("options.shortcuts.currentTab.heading")}
            footnote={t("options.shortcuts.copy.footnote")}
            listsTerms
          >
            {#each CURRENT_TAB_COMMANDS as command (command.name)}
              {@const toggle = command.toggle}
              <ShortcutRow
                label={t(command.label)}
                shortcut={keyOf(command.name)}
                notSetLabel={t("options.shortcuts.notSet")}
                toggle={toggle === undefined
                  ? undefined
                  : {
                      checked: toggle.isEnabled(current),
                      onchange: (enabled) => save(toggle.patch(enabled)),
                    }}
              />
            {/each}
          </SettingsSection>
        {:else if selected === "Data"}
          <SettingsSection footnote={t("options.data.export.footnote")}>
            <SettingRow label={t("options.data.export.label")} labelsControl={false}>
              {#snippet children(control)}
                <PushButton {...control} disabled={isExporting} onclick={exportData}>
                  {t("options.data.export.button")}
                </PushButton>
              {/snippet}
            </SettingRow>
          </SettingsSection>
          <DataImport
            {runtime}
            {t}
            onfinish={(finished) => announce(finished ? "Imported" : "ImportFailed")}
          />
        {/if}
      {:else if loadFailed}
        <p class="load-problem" role="alert">{t("options.loadFailed")}</p>
      {/if}
    </div>
  </main>
</div>

<style>
  .katip-options {
    isolation: isolate;
    display: grid;
    grid-template-columns: 236px minmax(0, 1fr);
    min-height: 100vh;
  }

  .side {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    height: 100vh;
    padding: 8px;
  }

  h1 {
    display: flex;
    align-items: center;
    height: 32px;
    margin: 6px 0 8px;
    padding: 0 10px;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .status-slot {
    margin-top: auto;
    padding: 8px 2px 4px;
  }

  .sheet {
    box-sizing: border-box;
    min-width: 0;
    min-height: calc(100vh - 16px);
    margin: 8px 8px 8px 0;
    border-radius: 12px;
    background: var(--sheet);
    box-shadow:
      0 0 0 0.5px var(--sheet-edge),
      var(--sheet-shadow);
  }

  .pane {
    display: flex;
    flex-direction: column;
    gap: 28px;
    box-sizing: border-box;
    min-height: 100%;
    /* Centers a 720px column with padding rather than a max-width, so the panel and its focus ring
       still span the whole sheet */
    padding: 36px max(48px, calc((100% - 720px) / 2)) 64px;
    border-radius: inherit;
  }

  .pane:focus-visible {
    outline-offset: -2px;
  }

  .pane-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    min-height: 32px;
  }

  h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .lede {
    max-width: 60ch;
    margin: -16px 0 0;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.5;
  }

  .value {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    text-align: end;
    user-select: text;
  }

  .link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    text-decoration: underline;
    text-decoration-color: var(--divider);
    text-underline-offset: 3px;
  }

  .link:hover {
    color: var(--text);
    text-decoration-color: currentColor;
  }

  .load-problem {
    margin: 0;
    color: var(--danger);
  }

  @media (max-width: 720px) {
    .katip-options {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto 1fr;
    }

    .side {
      position: static;
      height: auto;
      padding: 8px 8px 10px;
    }

    h1 {
      margin: 4px 0 6px;
    }

    .status-slot {
      position: fixed;
      right: 16px;
      bottom: 16px;
      left: 16px;
      z-index: 1;
      display: flex;
      justify-content: center;
      padding: 0;
      pointer-events: none;
    }

    .sheet {
      min-height: 0;
      margin: 0 8px 8px;
    }

    .pane {
      gap: 24px;
      padding: 24px 18px 48px;
    }

    h2 {
      font-size: 21px;
    }
  }
</style>
