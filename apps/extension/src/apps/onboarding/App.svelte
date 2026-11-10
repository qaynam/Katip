<script lang="ts">
  import { Effect } from "effect"
  import { onMount, tick } from "svelte"
  import type { Translator } from "#modules/i18n"
  import type { ColorScheme } from "#modules/theme"
  import type { SidebarView } from "#protocol"
  import { type Settings, type SettingsPatch, SettingsRepository } from "#modules/settings"
  import { Tabs } from "#platform/browser"
  import { KeyboardShortcuts, openChromeShortcutSettings } from "#platform/keyboard-shortcuts"
  import Keys from "./components/Keys.svelte"
  import Toggle from "./components/Toggle.svelte"
  import { ONBOARDING_SHORTCUTS, OPEN_SIDE_PANEL_COMMAND } from "./logic/onboarding-shortcuts"
  import { shortcutStatusOf } from "./logic/shortcut-status"
  import {
    isOptional,
    ONBOARDING_STEPS,
    type OnboardingStep,
    stepAfter,
    stepAfterSkipping,
    stepBefore,
  } from "./logic/steps"
  import type { OnboardingRuntime } from "./onboarding-runtime"
  import ArcImportScene from "./scenes/ArcImportScene.svelte"
  import BangsScene from "./scenes/BangsScene.svelte"
  import DoneScene from "./scenes/DoneScene.svelte"
  import FavoritesScene from "./scenes/FavoritesScene.svelte"
  import LiveFoldersScene from "./scenes/LiveFoldersScene.svelte"
  import ShortcutsScene from "./scenes/ShortcutsScene.svelte"
  import SidePanelScene from "./scenes/SidePanelScene.svelte"
  import ThemesScene from "./scenes/ThemesScene.svelte"
  import type { OriginAccess } from "../sidepanel/connection/origin-access"
  import type { SidebarConnection } from "../sidepanel/connection/sidebar-connection"
  import CommandsPanel from "./components/CommandsPanel.svelte"
  import LiveFolderChoices from "./components/LiveFolderChoices.svelte"
  import ThemeTryOn from "./components/ThemeTryOn.svelte"
  import { currentSystemScheme, watchSystemScheme } from "./system-scheme"

  interface Props {
    runtime: OnboardingRuntime
    translator: Translator
    /** The settings page, which the Arc step opens at its Data category. */
    optionsPageUrl: string
    /**
     * Opens Katip's side panel in this window, settling once it has. Chrome allows it only while a
     * press is handled, so it must be called before anything else is awaited.
     */
    openSidePanel: () => Promise<void>
    /** Closes this page. */
    close: () => void
    /** The background, as the side panel talks to it, for the steps that change a Space. */
    connection: SidebarConnection
    originAccess: OriginAccess
    faviconUrl: (pageUrl: string) => string | null
  }

  const {
    runtime,
    translator,
    optionsPageUrl,
    openSidePanel,
    close,
    connection,
    originAccess,
    faviconUrl,
  }: Props = $props()
  const t = $derived(translator.t)

  // Every step but the welcome, which comes first and stands apart from the rest
  const TOURED_STEPS = ONBOARDING_STEPS.slice(1)

  const COPY = {
    SidePanel: { title: "onboarding.sidePanel.title", body: "onboarding.sidePanel.body" },
    Shortcuts: { title: "onboarding.shortcuts.title", body: "onboarding.shortcuts.body" },
    ArcImport: { title: "onboarding.arcImport.title", body: "onboarding.arcImport.body" },
    Favorites: { title: "onboarding.favorites.title", body: "onboarding.favorites.body" },
    Themes: { title: "onboarding.themes.title", body: "onboarding.themes.body" },
    LiveFolders: { title: "onboarding.liveFolders.title", body: "onboarding.liveFolders.body" },
    Bangs: { title: "onboarding.bangs.title", body: "onboarding.bangs.body" },
    Done: { title: "onboarding.done.title", body: "onboarding.done.body" },
  } as const

  let step = $state<OnboardingStep>("Welcome")
  let settings = $state.raw<Settings | null>(null)
  let assigned = $state.raw<ReadonlyMap<string, string>>(new Map())
  let suggested = $state.raw<ReadonlyMap<string, string>>(new Map())
  let heading = $state<HTMLElement>()

  const sidePanelKey = $derived(
    assigned.get(OPEN_SIDE_PANEL_COMMAND) ?? suggested.get(OPEN_SIDE_PANEL_COMMAND) ?? null,
  )
  const position = $derived(ONBOARDING_STEPS.indexOf(step))
  const copy = $derived(step === "Welcome" ? null : COPY[step])

  const readShortcuts = async () => {
    const noKeys: ReadonlyMap<string, string> = new Map()
    const [nowAssigned, nowSuggested] = await runtime.runPromise(
      KeyboardShortcuts.use((shortcuts) =>
        Effect.all([shortcuts.assigned, shortcuts.suggested]),
      ).pipe(Effect.orElseSucceed(() => [noKeys, noKeys] as const)),
    )
    assigned = nowAssigned
    suggested = nowSuggested
  }

  let view = $state.raw<SidebarView | null>(null)
  const activeSpace = $derived(view?.spaces.find((space) => space.id === view?.activeSpaceId))
  $effect(() =>
    connection.listen((event) => {
      if (event._tag === "ViewUpdated") view = event.view
    }),
  )

  let scheme = $state<ColorScheme>(currentSystemScheme())
  $effect(() => watchSystemScheme((changed) => (scheme = changed)))

  onMount(() => {
    runtime.runPromise(SettingsRepository.use((repository) => repository.get)).then(
      (read) => (settings = read),
      () => {},
    )
    void readShortcuts()
    // Keys are assigned on Chrome's own page, so they are read again whenever this page is back
    const readWhenVisible = () => {
      if (document.visibilityState === "visible") void readShortcuts()
    }
    document.addEventListener("visibilitychange", readWhenVisible)
    window.addEventListener("focus", readWhenVisible)
    return () => {
      document.removeEventListener("visibilitychange", readWhenVisible)
      window.removeEventListener("focus", readWhenVisible)
    }
  })

  const save = async (patch: SettingsPatch) => {
    settings = await runtime
      .runPromise(SettingsRepository.use((repository) => repository.update(patch)))
      .catch(() => settings)
  }

  const go = async (next: OnboardingStep) => {
    step = next
    await tick()
    heading?.focus()
  }

  const openInTab = (url: string) =>
    runtime.runPromise(Tabs.use((tabs) => tabs.create({ url }))).catch(() => {})

  // Closing the page before the side panel has opened could cut the request short
  const openKatip = async () => {
    await openSidePanel()
    close()
  }
</script>

<main class="onboarding">
  {#if copy === null}
    <!-- Faint colors drifting behind the welcome, in the Space colors of Katip's website -->
    <div class="mesh" aria-hidden="true">
      <span class="blob blue"></span>
      <span class="blob violet"></span>
      <span class="blob coral"></span>
      <span class="blob pink"></span>
    </div>
    <section class="welcome">
      <img class="app-icon" src="/icons/icon-128.png" width="128" height="128" alt="" />
      <h1 bind:this={heading} tabindex="-1">{t("onboarding.welcome.title")}</h1>
      <p class="lead">{t("onboarding.welcome.lead")}</p>
      <button type="button" class="button primary" onclick={() => go(stepAfter(step))}>
        {t("onboarding.welcome.start")}
      </button>
    </section>
  {:else}
    <article class="card">
      <header class="top">
        <ol class="dots" aria-hidden="true">
          {#each TOURED_STEPS as toured, index (toured)}
            <li class:reached={index < position}></li>
          {/each}
        </ol>
        <p class="visually-hidden">
          {t("onboarding.progress", { current: position, total: TOURED_STEPS.length })}
        </p>
        {#if isOptional(step)}
          <button type="button" class="text-button" onclick={() => go(stepAfterSkipping(step))}>
            {t("onboarding.skip")}
          </button>
        {/if}
      </header>

      {#key step}
        <div class="step">
          {#if step === "SidePanel"}
            <SidePanelScene />
          {:else if step === "Shortcuts"}
            {#if sidePanelKey === null}
              <SidePanelScene />
            {:else}
              <ShortcutsScene shortcut={sidePanelKey} />
            {/if}
          {:else if step === "ArcImport"}
            <ArcImportScene />
          {:else if step === "Favorites"}
            <FavoritesScene />
          {:else if step === "Themes"}
            {#if activeSpace === undefined}
              <ThemesScene />
            {:else}
              {@const spaceId = activeSpace.id}
              <ThemeTryOn
                theme={activeSpace.theme}
                spaceName={activeSpace.name}
                {scheme}
                {t}
                onsave={(theme) => void connection.run({ _tag: "SetSpaceTheme", spaceId, theme })}
              />
            {/if}
          {:else if step === "LiveFolders"}
            <LiveFoldersScene />
          {:else if step === "Bangs"}
            <BangsScene />
          {:else}
            <DoneScene />
          {/if}

          <div class="copy">
            <h1 bind:this={heading} tabindex="-1">{t(copy.title)}</h1>
            <p class="body">{t(copy.body)}</p>

            {#if step === "SidePanel"}
              <div class="extras inline">
                {#if sidePanelKey !== null}
                  <span class="shortcut">
                    {t("onboarding.sidePanel.shortcut")}
                    <Keys shortcut={sidePanelKey} />
                  </span>
                {/if}
                <button type="button" class="button secondary" onclick={() => void openSidePanel()}>
                  {t("onboarding.sidePanel.open")}
                </button>
              </div>
            {:else if step === "Shortcuts"}
              <ul class="shortcuts">
                {#each ONBOARDING_SHORTCUTS as shortcut (shortcut.command)}
                  {@const status = shortcutStatusOf(shortcut.command, assigned, suggested)}
                  {@const labelId = `shortcut-${shortcut.command}`}
                  <li>
                    <span class="name">
                      <span id={labelId}>{t(shortcut.label)}</span>
                      {#if status._tag === "Refused"}
                        <span class="warning">
                          {t("onboarding.shortcuts.refused", { key: status.suggested })}
                        </span>
                      {/if}
                    </span>
                    {#if status._tag === "Assigned"}
                      <Keys shortcut={status.key} />
                    {:else}
                      <span class="not-set">{t("onboarding.shortcuts.notSet")}</span>
                    {/if}
                    {#if shortcut.turnedOnBy !== undefined && settings !== null}
                      {@const turnedOnBy = shortcut.turnedOnBy}
                      <Toggle
                        aria-labelledby={labelId}
                        checked={settings.pageShortcuts[turnedOnBy]}
                        onchange={(checked) => save({ pageShortcuts: { [turnedOnBy]: checked } })}
                      />
                    {/if}
                  </li>
                {/each}
              </ul>
              <div class="extras">
                <p class="note">{t("onboarding.shortcuts.copyNote")}</p>
                <button
                  type="button"
                  class="button secondary"
                  onclick={() => runtime.runPromise(openChromeShortcutSettings).catch(() => {})}
                >
                  {t("onboarding.shortcuts.edit")}
                </button>
              </div>
            {:else if step === "ArcImport"}
              <div class="extras">
                <button
                  type="button"
                  class="button secondary"
                  onclick={() => openInTab(`${optionsPageUrl}#data`)}
                >
                  {t("onboarding.arcImport.open")}
                </button>
              </div>
            {:else if step === "Themes" && activeSpace !== undefined}
              <p class="note">{t("onboarding.themes.try", { space: activeSpace.name })}</p>
            {:else if step === "LiveFolders" && activeSpace !== undefined}
              <LiveFolderChoices
                {t}
                spaceId={activeSpace.id}
                spaceName={activeSpace.name}
                run={connection.run}
                {originAccess}
                {faviconUrl}
              />
            {:else if step === "Bangs"}
              {#if settings !== null}
                <label class="setting">
                  <span>{t("options.spotlight.bangs.label")}</span>
                  <Toggle checked={settings.bangs} onchange={(bangs) => save({ bangs })} />
                </label>
              {/if}
              <CommandsPanel {runtime} {translator} {faviconUrl} />
            {/if}
          </div>
        </div>
      {/key}

      <footer class="actions">
        <button type="button" class="button secondary" onclick={() => go(stepBefore(step))}>
          {t("onboarding.back")}
        </button>
        {#if step === "Done"}
          <span class="end">
            <button type="button" class="button secondary" onclick={close}>
              {t("onboarding.done.close")}
            </button>
            <button type="button" class="button primary" onclick={openKatip}>
              {t("onboarding.done.openKatip")}
            </button>
          </span>
        {:else}
          <button type="button" class="button primary" onclick={() => go(stepAfter(step))}>
            {t("onboarding.continue")}
          </button>
        {/if}
      </footer>
    </article>
  {/if}
</main>

<style>
  /* The look of Katip's website. Apps have no way to share CSS, so these values are kept in step
     with apps/web/src/styles/global.css by hand */
  .onboarding {
    --backdrop: #f5f5f7;
    --surface: #ffffff;
    --stage: #f5f5f7;
    --ink: #1d1d1f;
    --ink-secondary: #6e6e73;
    --hairline: rgb(0 0 0 / 0.09);
    --accent: #1a68d9;
    --button: #1a68d9;
    --button-hover: #1559bd;
    --accent-soft: rgb(31 116 240 / 0.09);
    --focus: #1f74f0;
    --warning: #a35200;
    --window-shadow:
      0 0 0 1px rgb(0 0 0 / 0.07), 0 24px 60px rgb(0 0 0 / 0.13), 0 6px 16px rgb(0 0 0 / 0.05);
    --card-shadow: 0 0 0 1px rgb(0 0 0 / 0.05), 0 12px 32px rgb(0 0 0 / 0.05);
    --glow-strength: 0.75;
    --mesh-strength: 0.3;

    display: grid;
    place-items: center;
    box-sizing: border-box;
    min-height: 100vh;
    padding: clamp(1.25rem, 4vw, 3rem);
    background: radial-gradient(90% 55% at 50% 0%, var(--surface) 0%, var(--backdrop) 75%);
    color: var(--ink);
    font-size: 16px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  @media (prefers-color-scheme: dark) {
    .onboarding {
      --backdrop: #0b0b0d;
      --surface: #1c1c1e;
      --stage: #141416;
      --ink: #f5f5f7;
      --ink-secondary: #a1a1a6;
      --hairline: rgb(255 255 255 / 0.12);
      --accent: #5aa2ff;
      --button-hover: #2f7be6;
      --accent-soft: rgb(90 162 255 / 0.14);
      --focus: #5aa2ff;
      --warning: #ffb45c;
      --window-shadow:
        0 0 0 1px rgb(255 255 255 / 0.1), 0 24px 60px rgb(0 0 0 / 0.55), 0 6px 16px rgb(0 0 0 / 0.3);
      --card-shadow: 0 0 0 1px rgb(255 255 255 / 0.08);
      --glow-strength: 0.45;
      --mesh-strength: 0.18;
    }
  }

  .onboarding :global(*:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  h1 {
    margin: 0;
    outline: none;
  }

  .mesh {
    position: fixed;
    inset: 0;
    overflow: hidden;
    opacity: var(--mesh-strength);
    pointer-events: none;
  }

  .blob {
    position: absolute;
    width: 70vmax;
    height: 70vmax;
    border-radius: 50%;
    filter: blur(70px);
    animation: drift 28s ease-in-out infinite alternate;
  }

  .blue {
    top: -30vmax;
    left: -20vmax;
    background: radial-gradient(circle, #86b3f5 0%, transparent 62%);
  }

  .violet {
    top: -25vmax;
    right: -25vmax;
    background: radial-gradient(circle, #b4a9f2 0%, transparent 62%);
    animation-duration: 34s;
    animation-delay: -8s;
  }

  .coral {
    bottom: -35vmax;
    left: -10vmax;
    background: radial-gradient(circle, #f7a184 0%, transparent 62%);
    animation-duration: 31s;
    animation-delay: -15s;
  }

  .pink {
    right: -20vmax;
    bottom: -30vmax;
    background: radial-gradient(circle, #ee9cc2 0%, transparent 62%);
    animation-duration: 37s;
    animation-delay: -4s;
  }

  @keyframes drift {
    0% {
      translate: 0 0;
      scale: 1;
    }
    33% {
      translate: 12vmax 6vmax;
      scale: 1.12;
    }
    66% {
      translate: -6vmax 14vmax;
      scale: 0.92;
    }
    100% {
      translate: 8vmax -8vmax;
      scale: 1.06;
    }
  }

  .welcome {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 38rem;
    text-align: center;
  }

  .app-icon {
    width: clamp(6rem, 4.5rem + 4vw, 8rem);
    height: auto;
    margin-bottom: 1.5rem;
    animation: float 5s ease-in-out infinite;
  }

  .welcome h1 {
    font-size: clamp(2.25rem, 1.4rem + 3.6vw, 3.75rem);
    line-height: 1.06;
    letter-spacing: -0.032em;
  }

  .lead {
    margin: 1.25rem 0 2.25rem;
    color: var(--ink-secondary);
    font-size: clamp(1.125rem, 1rem + 0.5vw, 1.375rem);
    line-height: 1.45;
    letter-spacing: -0.014em;
  }

  :lang(ja) .welcome h1 {
    line-height: 1.2;
    letter-spacing: 0;
  }

  :lang(ja) .lead {
    line-height: 1.75;
    letter-spacing: 0;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    box-sizing: border-box;
    width: min(54rem, 100%);
    padding: clamp(1.25rem, 3vw, 2rem);
    border-radius: 1.5rem;
    background: var(--surface);
    box-shadow: var(--card-shadow);
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 1.75rem;
  }

  .dots {
    display: flex;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dots li {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--ink) 15%, transparent);
    transition:
      width 240ms ease,
      background 240ms ease;
  }

  .dots li.reached {
    background: var(--button);
  }

  .dots li.reached:has(+ li:not(.reached)),
  .dots li.reached:last-child {
    width: 20px;
    border-radius: 4px;
  }

  .step {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
    animation: enter 360ms ease both;
  }

  .copy {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .copy h1 {
    font-size: clamp(1.625rem, 1.3rem + 1.2vw, 2.125rem);
    line-height: 1.15;
    letter-spacing: -0.024em;
  }

  .body {
    margin: 0;
    color: var(--ink-secondary);
    font-size: 1.0625rem;
    line-height: 1.55;
  }

  :lang(ja) .copy h1 {
    line-height: 1.35;
    letter-spacing: 0;
  }

  :lang(ja) .body {
    line-height: 1.8;
  }

  .extras {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .extras.inline {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem 1.5rem;
  }

  .shortcut {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    color: var(--ink-secondary);
  }

  .shortcuts {
    margin: 0.5rem 0 0;
    padding: 0;
    list-style: none;
  }

  .shortcuts li {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 3rem;
    padding: 0.5rem 0;
  }

  .shortcuts li + li {
    border-top: 1px solid var(--hairline);
  }

  .name {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.125rem;
    font-weight: 500;
  }

  .warning {
    color: var(--warning);
    font-size: 0.875rem;
    font-weight: 400;
  }

  .not-set {
    color: var(--ink-secondary);
    font-size: 0.9375rem;
  }

  .note {
    margin: 0;
    color: var(--ink-secondary);
    font-size: 0.875rem;
  }

  .setting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.5rem;
    padding: 0.875rem 1rem;
    border-radius: 0.875rem;
    background: var(--stage);
    font-weight: 500;
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding-top: 0.25rem;
  }

  .end {
    display: flex;
    gap: 0.75rem;
  }

  .onboarding :global(.button) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    padding: 0.625rem 1.375rem;
    border: none;
    border-radius: 999px;
    font: inherit;
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.25;
    letter-spacing: -0.01em;
    cursor: pointer;
    transition:
      background 140ms ease,
      color 140ms ease;
  }

  .onboarding :global(.button.small) {
    min-height: 2.125rem;
    padding: 0.375rem 1rem;
    font-size: 0.9375rem;
  }

  .onboarding :global(.button:disabled) {
    opacity: 0.5;
    cursor: default;
  }

  /* The buttons' classes are made distinct so that the side panel's theme editor, shown in the
     theme step, keeps its own look */
  .onboarding :global(.button.primary) {
    background: var(--button);
    color: #ffffff;
  }

  .onboarding :global(.button.primary:hover) {
    background: var(--button-hover);
  }

  .onboarding :global(.button.secondary) {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--card-shadow);
  }

  .onboarding :global(.button.secondary:hover:not(:disabled)) {
    color: var(--accent);
  }

  .onboarding :global(.text-button) {
    padding: 0.25rem 0.5rem;
    border: none;
    border-radius: 0.5rem;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @keyframes enter {
    from {
      opacity: 0;
      translate: 0 8px;
    }
  }

  @keyframes float {
    0%,
    100% {
      translate: 0 0;
    }
    50% {
      translate: 0 -6px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .step,
    .app-icon,
    .blob {
      animation: none;
    }
  }
</style>
