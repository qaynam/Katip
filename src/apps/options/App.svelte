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
    SettingsRepository,
    type Settings,
    type SettingsPatch,
  } from "#modules/settings"
  import IdleMinutesRow from "./IdleMinutesRow.svelte"
  import type { OptionsRuntime } from "./options-runtime"
  import PopUpButton, { type PopUpOption } from "./PopUpButton.svelte"
  import PushButton from "./PushButton.svelte"
  import SettingRow from "./SettingRow.svelte"
  import SettingsSection from "./SettingsSection.svelte"
  import { openChromeShortcutSettings } from "./shortcut-settings"
  import StatusNote, { type Note } from "./StatusNote.svelte"
  import Switch from "./Switch.svelte"

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

  $effect(() => {
    document.documentElement.lang = translator.languageTag
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

<header class="toolbar">
  <div class="column">
    <h1>{t("options.title")}</h1>
    <StatusNote {note} />
  </div>
</header>

<main class="column">
  {#if settings !== null}
    {@const current = settings}

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
      <IdleMinutesRow
        value={current.autoArchive.idleMinutes}
        disabled={!current.autoArchive.enabled}
        {translator}
        oncommit={(idleMinutes) => save({ autoArchive: { idleMinutes } })}
      />
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

<style>
  .column {
    box-sizing: border-box;
    max-width: 640px;
    margin-inline: auto;
    padding-inline: 20px;
  }

  .toolbar {
    position: sticky;
    top: 0;
    z-index: 1;
    border-bottom: 1px solid transparent;
    background: var(--toolbar);
    backdrop-filter: saturate(1.8) blur(20px);
    animation: reveal-edge linear both;
    animation-timeline: scroll();
    animation-range: 0 16px;
  }

  @keyframes reveal-edge {
    to {
      border-bottom-color: var(--separator);
    }
  }

  .toolbar .column {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 2px 16px;
    padding-top: 28px;
    padding-bottom: 14px;
  }

  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.2;
  }

  main {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding-top: 8px;
    padding-bottom: 64px;
  }

  .value {
    color: var(--secondary-label);
    font-variant-numeric: tabular-nums;
    user-select: text;
  }

  .load-problem {
    margin: 0;
    padding: 12px;
    border: 1px solid var(--group-edge);
    border-radius: 10px;
    background: var(--group);
    color: var(--danger);
  }
</style>
