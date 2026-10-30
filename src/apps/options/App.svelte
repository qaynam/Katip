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
  import { appearanceOf, type ColorScheme, neutralTheme } from "#modules/theme"
  import { Tabs } from "#platform/browser"
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
  }: {
    runtime: OptionsRuntime
    version: string
    /** `navigator.languages` と同じく、優先する順に並んだ BCP 47 の言語タグ。 */
    browserLanguages: ReadonlyArray<string>
  } = $props()

  type Outcome = "Saved" | "SaveFailed" | "ShortcutsUnavailable"

  const outcomeMessages = {
    Saved: "options.saved",
    SaveFailed: "options.saveFailed",
    ShortcutsUnavailable: "options.shortcuts.openFailed",
  } as const satisfies Record<Outcome, MessageKey>

  let settings = $state<Settings | null>(null)
  let loadFailed = $state(false)
  let supportsSplitView = $state<boolean | null>(null)
  let systemScheme = $state<ColorScheme>(currentSystemScheme())
  let outcome = $state<Outcome | null>(null)
  let hideSavedTimer: ReturnType<typeof setTimeout> | undefined

  const translator = $derived(
    makeTranslator(resolveLocale(settings?.locale ?? "auto", browserLanguages)),
  )
  const t = $derived(translator.t)

  const note = $derived<Note | null>(
    outcome === null
      ? null
      : { text: t(outcomeMessages[outcome]), tone: outcome === "Saved" ? "Quiet" : "Alert" },
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
      clearTimeout(hideSavedTimer)
    }
  })

  const announce = (next: Outcome) => {
    clearTimeout(hideSavedTimer)
    outcome = next
    if (next === "Saved") {
      hideSavedTimer = setTimeout(() => (outcome = null), 2000)
    }
  }

  // チェックボックスはクリックした時点で DOM 上は切り替わっている。保存を待ってから状態を
  // 変える方式だと、失敗して元の値に戻すときに状態が変化しないので、表示が戻らない
  const save = async (patch: SettingsPatch) => {
    if (settings === null) return
    const beforeSave = settings
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

  const openShortcutSettings = async () => {
    const opened = await runtime.runPromiseExit(openChromeShortcutSettings)
    if (Exit.isFailure(opened)) announce("ShortcutsUnavailable")
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

      <SettingsSection footnote={t("options.shortcuts.footnote")}>
        <SettingRow label={t("options.shortcuts.label")} labelsControl={false}>
          {#snippet children(control)}
            <PushButton {...control} onclick={openShortcutSettings}>
              {t("options.shortcuts.open")}
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

  .load-problem {
    margin: 0;
    padding: 10px 12px;
    border-radius: var(--radius-row);
    background: var(--surface-raised);
    color: var(--danger);
  }
</style>
