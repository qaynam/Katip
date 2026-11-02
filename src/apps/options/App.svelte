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
    type KeyboardPlatform,
    PAGE_SHORTCUTS,
    type PageShortcut,
    pageShortcutLabel,
  } from "#modules/page-shortcuts"
  import {
    applySettingsPatch,
    idleDurationOf,
    idleMinutesChoicesWith,
    SettingsRepository,
    type Settings,
    type SettingsPatch,
  } from "#modules/settings"
  import { appearanceOf, type ColorScheme, neutralTheme } from "#modules/theme"
  import { Tabs } from "#platform/browser"
  import { downloadExportFile } from "./data-export"
  import { OptionalPermissions } from "./optional-permissions"
  import type { OptionsRuntime } from "./options-runtime"
  import PopUpButton, { type PopUpOption } from "./PopUpButton.svelte"
  import PushButton from "./PushButton.svelte"
  import SettingRow from "./SettingRow.svelte"
  import SettingsSection from "./SettingsSection.svelte"
  import { openChromeShortcutSettings } from "./shortcut-settings"
  import StatusNote, { type Note } from "./StatusNote.svelte"
  import Switch from "./Switch.svelte"
  import { currentSystemScheme, watchSystemScheme } from "./system-scheme"

  let {
    runtime,
    version,
    browserLanguages,
    keyboardPlatform,
  }: {
    runtime: OptionsRuntime
    version: string
    /** `navigator.languages` と同じく、優先する順に並んだ BCP 47 の言語タグ。 */
    browserLanguages: ReadonlyArray<string>
    keyboardPlatform: KeyboardPlatform
  } = $props()

  type Outcome =
    | "Saved"
    | "SaveFailed"
    | "ShortcutsUnavailable"
    | "AllSitesDenied"
    | "HistoryDenied"
    | "Exported"
    | "ExportFailed"

  const outcomeNotes = {
    Saved: { message: "options.saved", tone: "Done" },
    SaveFailed: { message: "options.saveFailed", tone: "Alert" },
    ShortcutsUnavailable: { message: "options.shortcuts.openFailed", tone: "Alert" },
    AllSitesDenied: { message: "options.pageShortcuts.denied", tone: "Info" },
    HistoryDenied: { message: "options.spotlight.history.denied", tone: "Info" },
    Exported: { message: "options.data.exported", tone: "Done" },
    ExportFailed: { message: "options.data.exportFailed", tone: "Alert" },
  } as const satisfies Record<Outcome, { message: MessageKey; tone: Note["tone"] }>

  const pageShortcutSettings = {
    CopyUrl: {
      label: "actions.copyUrl",
      isEnabled: (current: Settings) => current.pageShortcuts.copyUrl,
      patch: (enabled: boolean): SettingsPatch => ({ pageShortcuts: { copyUrl: enabled } }),
    },
    CopyMarkdownLink: {
      label: "actions.copyMarkdownLink",
      isEnabled: (current: Settings) => current.pageShortcuts.copyMarkdownLink,
      patch: (enabled: boolean): SettingsPatch => ({
        pageShortcuts: { copyMarkdownLink: enabled },
      }),
    },
  } as const satisfies Record<
    PageShortcut,
    {
      readonly label: MessageKey
      readonly isEnabled: (current: Settings) => boolean
      readonly patch: (enabled: boolean) => SettingsPatch
    }
  >

  let settings = $state<Settings | null>(null)
  let loadFailed = $state(false)
  let supportsSplitView = $state<boolean | null>(null)
  let searchesHistory = $state<boolean | null>(null)
  let systemScheme = $state<ColorScheme>(currentSystemScheme())
  let outcome = $state<Outcome | null>(null)
  let isExporting = $state(false)
  let hideDoneNoteTimer: ReturnType<typeof setTimeout> | undefined

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

  const appearance = $derived(appearanceOf(neutralTheme, systemScheme))

  $effect(() => watchSystemScheme((scheme) => (systemScheme = scheme)))

  // スクロールの行き過ぎで見える余白まで同じ色にするため、ページの背景は文書全体に塗る
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

  const announce = (next: Outcome) => {
    clearTimeout(hideDoneNoteTimer)
    outcome = next
    if (outcomeNotes[next].tone === "Done") {
      hideDoneNoteTimer = setTimeout(() => (outcome = null), 2000)
    }
  }

  // チェックボックスはクリックした時点で DOM 上は切り替わっている。保存を待ってから状態を
  // 変える方式だと、失敗して元の値に戻すときに状態が変化しないので、表示が戻らない
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

  // オフにするときにすべてのサイトへの許可を外さない。ライブフォルダの取得元へのアクセスが
  // この許可で賄われていることがあり、外すとそちらまで読めなくなる。もう一方のショートカットも
  // 同じ許可を使っている
  const setPageShortcut = async (shortcut: PageShortcut, enabled: boolean) => {
    const patch = pageShortcutSettings[shortcut].patch(enabled)
    if (settings === null) return
    if (!enabled) return saveOver(settings, patch)
    const beforeRequest = settings
    settings = applySettingsPatch(beforeRequest, patch)
    const granted = await runtime.runPromiseExit(
      OptionalPermissions.use((permissions) => permissions.request("AllSites")),
    )
    if (Exit.isSuccess(granted) && granted.value) return saveOver(beforeRequest, patch)
    settings = beforeRequest
    announce(Exit.isSuccess(granted) ? "AllSitesDenied" : "SaveFailed")
  }

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
  style:--page-background={appearance.background}
  style:--grain-opacity={appearance.grainOpacity}
>
  <div class="grain" aria-hidden="true"></div>

  <header class="toolbar">
    <div class="column">
      <h1>{t("options.title")}</h1>
      <StatusNote {note} />
    </div>
  </header>

  <main class="column">
    {#if settings !== null}
      {@const current = settings}
      {@const idleTimeOptions = idleMinutesChoicesWith(current.autoArchive.idleMinutes).map(
        (minutes) => ({ value: minutes, label: translator.duration(idleDurationOf(minutes)) }),
      )}

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

      <SettingsSection heading={t("options.tabs.heading")}>
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

      <SettingsSection
        heading={t("options.autoArchive.heading")}
        footnote={t("options.autoArchive.footnote")}
      >
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
              options={idleTimeOptions}
              disabled={!current.autoArchive.enabled}
              onchange={(idleMinutes) => save({ autoArchive: { idleMinutes } })}
            />
          {/snippet}
        </SettingRow>
      </SettingsSection>

      {#if searchesHistory !== null}
        <SettingsSection
          heading={t("options.spotlight.heading")}
          footnote={t("options.spotlight.history.footnote")}
        >
          <SettingRow label={t("options.spotlight.history.label")}>
            {#snippet children(control)}
              <Switch {...control} checked={searchesHistory === true} onchange={setHistorySearch} />
            {/snippet}
          </SettingRow>
        </SettingsSection>
      {/if}

      <SettingsSection
        heading={t("options.pageShortcuts.heading")}
        footnote={t("options.pageShortcuts.footnote")}
      >
        {#each PAGE_SHORTCUTS as shortcut (shortcut)}
          <SettingRow label={t(pageShortcutSettings[shortcut].label)}>
            {#snippet children(control)}
              <kbd class="keys">{pageShortcutLabel(shortcut, keyboardPlatform)}</kbd>
              <Switch
                {...control}
                checked={pageShortcutSettings[shortcut].isEnabled(current)}
                onchange={(enabled) => setPageShortcut(shortcut, enabled)}
              />
            {/snippet}
          </SettingRow>
        {/each}
      </SettingsSection>

      <SettingsSection footnote={t("options.shortcuts.footnote")}>
        <SettingRow label={t("options.shortcuts.label")} labelsControl={false}>
          {#snippet children(control)}
            <PushButton {...control} onclick={openShortcutSettings}>
              {t("options.shortcuts.open")}
            </PushButton>
          {/snippet}
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        heading={t("options.data.heading")}
        footnote={t("options.data.export.footnote")}
      >
        <SettingRow label={t("options.data.export.label")} labelsControl={false}>
          {#snippet children(control)}
            <PushButton {...control} disabled={isExporting} onclick={exportData}>
              {t("options.data.export.button")}
            </PushButton>
          {/snippet}
        </SettingRow>
      </SettingsSection>

      <SettingsSection>
        <SettingRow label={t("options.version.label")} labelsControl={false}>
          {#snippet children(control)}
            <span {...control} class="value">{version}</span>
          {/snippet}
        </SettingRow>
      </SettingsSection>
    {:else if loadFailed}
      <p class="load-problem" role="alert">{t("options.loadFailed")}</p>
    {/if}
  </main>
</div>

<style>
  .katip-options {
    isolation: isolate;
    min-height: 100vh;
  }

  .grain {
    position: fixed;
    inset: 0;
    z-index: -1;
    background-image: var(--grain-image);
    background-size: 200px 200px;
    opacity: var(--grain-opacity);
    pointer-events: none;
  }

  .column {
    box-sizing: border-box;
    max-width: 600px;
    margin-inline: auto;
    padding-inline: 16px;
  }

  /* 下を流れる行を隠すため不透明に塗る。粒も背景と同じ位置に描いて、継ぎ目を見せない */
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 1;
    border-bottom: 1px solid transparent;
    background: var(--page-background);
    animation: reveal-edge linear both;
    animation-timeline: scroll();
    animation-range: 0 16px;
  }

  .toolbar::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: var(--grain-image);
    background-size: 200px 200px;
    background-attachment: fixed;
    opacity: var(--grain-opacity);
    pointer-events: none;
  }

  @keyframes reveal-edge {
    to {
      border-bottom-color: var(--divider);
    }
  }

  .toolbar .column {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 2px 16px;
    padding-top: 28px;
    padding-bottom: 12px;
  }

  h1 {
    margin: 0 0 0 12px;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  main {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-top: 6px;
    padding-bottom: 56px;
  }

  .value {
    padding-right: 4px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    text-align: end;
    user-select: text;
  }

  .keys {
    margin-right: 10px;
    padding: 1px 6px;
    border-radius: 5px;
    background: var(--surface-hover);
    color: var(--text-muted);
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .load-problem {
    margin: 0;
    padding: 10px 12px;
    border-radius: var(--radius-row);
    background: var(--surface-raised);
    color: var(--danger);
  }
</style>
