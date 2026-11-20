<script lang="ts">
  import { Effect, Exit, Stream } from "effect"
  import type { Translator } from "#modules/i18n"
  import {
    hostOfSite,
    type KnownOutputs,
    type SoundRule,
    type SoundRules,
    SoundSettings,
    type SoundSite,
    withoutRule,
    withRule,
  } from "#modules/sound"
  import type { OptionsRuntime } from "./options-runtime"
  import PopUpButton, { type PopUpOption } from "./PopUpButton.svelte"
  import SettingsSection from "./SettingsSection.svelte"

  let {
    runtime,
    translator,
    faviconUrl,
    onsave,
  }: {
    runtime: OptionsRuntime
    translator: Translator
    faviconUrl: (pageUrl: string) => string | null
    /** Called once a change is saved or fails to be. */
    onsave: (saved: boolean) => void
  } = $props()

  let rules = $state.raw<SoundRules | null>(null)
  let knownOutputs = $state.raw<KnownOutputs>([])
  const t = $derived(translator.t)
  const ids = $props.id()

  // No output's name is empty: pages leave unnamed outputs out
  const SYSTEM_DEFAULT = ""

  $effect(() => {
    void runtime.runPromise(SoundSettings.use((settings) => settings.knownOutputs)).then(
      (known) => (knownOutputs = known),
      () => {},
    )
  })

  // The site's output stays listed even if no page has seen it lately
  const outputOptions = (rule: SoundRule): ReadonlyArray<PopUpOption<string>> => [
    { value: SYSTEM_DEFAULT, label: t("options.sound.defaultOutput") },
    ...[
      ...knownOutputs,
      ...(rule.output === null || knownOutputs.includes(rule.output) ? [] : [rule.output]),
    ].map((name) => ({ value: name, label: name })),
  ]

  $effect(() =>
    runtime.runCallback(
      SoundSettings.use((settings) =>
        Stream.runForEach(settings.changes, (latest) =>
          Effect.sync(() => {
            rules = latest
          }),
        ),
      ).pipe(Effect.ignore),
    ),
  )

  const save = async (change: (rules: SoundRules) => SoundRules) => {
    const saved = await runtime.runPromiseExit(
      SoundSettings.use((settings) => settings.update(change)),
    )
    if (Exit.isSuccess(saved)) rules = saved.value
    onsave(Exit.isSuccess(saved))
  }

  const forget = (site: SoundSite) => save((current) => withoutRule(current, site))

  const playOn = (rule: SoundRule, chosen: string) =>
    save((current) =>
      withRule(current, { ...rule, output: chosen === SYSTEM_DEFAULT ? null : chosen }),
    )
</script>

{#if rules !== null}
  <SettingsSection heading={t("options.sound.sites.heading")}>
    {#if rules.length === 0}
      <p class="empty">{t("options.sound.empty")}</p>
    {:else}
      <ul class="sites">
        {#each rules as rule, index (rule.site)}
          {@const host = hostOfSite(rule.site)}
          {@const icon = faviconUrl(rule.site)}
          {@const selectId = `${ids}-output-${index}`}
          <li class="site">
            <span class="tile" aria-hidden="true">
              {#if icon !== null}
                <img src={icon} alt="" width="16" height="16" />
              {/if}
            </span>
            <label class="host" for={selectId}>{host}</label>
            <PopUpButton
              id={selectId}
              aria-describedby={undefined}
              value={rule.output ?? SYSTEM_DEFAULT}
              options={outputOptions(rule)}
              onchange={(chosen) => playOn(rule, chosen)}
            />
            <button
              type="button"
              aria-label={t("options.sound.removeLabel", { site: host })}
              onclick={() => forget(rule.site)}
            >
              {t("options.sound.remove")}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </SettingsSection>
{/if}

<style>
  .empty {
    margin: 0;
    padding: 12px 0;
    color: var(--text-muted);
    font-size: 13px;
  }

  .sites {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .site {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 8px 0;
  }

  .site:not(:first-child) {
    border-top: 0.5px solid var(--divider);
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

  .host {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 14px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  button {
    flex: none;
    height: 26px;
    padding: 0 9px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-muted);
    font-size: 12.5px;
  }

  button:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
</style>
