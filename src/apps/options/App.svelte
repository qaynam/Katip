<script lang="ts">
  import { Effect, Exit, Stream } from "effect"
  import {
    applySettingsPatch,
    SettingsRepository,
    type Settings,
    type SettingsPatch,
  } from "#modules/settings"
  import { TabGroupColor } from "#platform/browser"
  import IdleMinutesField from "./IdleMinutesField.svelte"
  import type { OptionsRuntime } from "./options-runtime"
  import SaveStatus, { type SaveOutcome } from "./SaveStatus.svelte"
  import SettingSwitch from "./SettingSwitch.svelte"

  let { runtime }: { runtime: OptionsRuntime } = $props()

  let settings = $state<Settings | null>(null)
  let loadFailed = $state(false)
  let outcome = $state<SaveOutcome | null>(null)
  let hideSavedTimer: ReturnType<typeof setTimeout> | undefined

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

  const announce = (next: SaveOutcome) => {
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
      announce("Failed")
    }
  }
</script>

<main>
  <article class="sheet">
    <div class="index-tabs" aria-hidden="true">
      {#each TabGroupColor.literals as color (color)}
        <span style:background-color="var(--group-{color})"></span>
      {/each}
    </div>

    <header>
      <p class="wordmark">Katip</p>
      <h1>設定</h1>
      <p class="lede">変更はすぐに保存されます。</p>
    </header>

    {#if settings !== null}
      <section aria-labelledby="tabs-heading">
        <h2 id="tabs-heading">タブと Space</h2>
        <SettingSwitch
          label="新しいタブを一時タブの一番上に表示する"
          description="オフにすると Chrome のタブバーと同じ並びになり、新しいタブは一番下に追加されます。"
          checked={settings.newTabsOnTop}
          onchange={(checked) => save({ newTabsOnTop: checked })}
        />
        <SettingSwitch
          label="閉じたフォルダでも、開いているタブをすべて表示する"
          description="オフにすると、閉じたフォルダの下にはアクティブなタブと、フォルダを閉じている間に表示したタブだけが並びます。"
          checked={settings.showAllOpenTabsInCollapsedFolders}
          onchange={(checked) => save({ showAllOpenTabsInCollapsedFolders: checked })}
        />
        <SettingSwitch
          label="Space を Chrome のタブグループと同期する"
          description="ウィンドウごとに Space をタブグループとして表示します。グループ側で名前や色を変えても Space には反映されず、次の同期で元に戻ります。同期中はフォルダの中にフォルダを作れません。"
          checked={settings.syncTabGroups}
          onchange={(checked) => save({ syncTabGroups: checked })}
        />
      </section>

      <section aria-labelledby="archive-heading">
        <h2 id="archive-heading">自動アーカイブ</h2>
        <SettingSwitch
          label="使っていない一時タブを自動でアーカイブする"
          description="閉じたタブはアーカイブに記録され、あとから開き直せます。ピン留め・Chrome で固定・音声を再生中・表示中のタブは閉じません。"
          checked={settings.autoArchive.enabled}
          onchange={(enabled) => save({ autoArchive: { enabled } })}
        />
        <IdleMinutesField
          value={settings.autoArchive.idleMinutes}
          disabled={!settings.autoArchive.enabled}
          oncommit={(idleMinutes) => save({ autoArchive: { idleMinutes } })}
        />
      </section>
    {:else if loadFailed}
      <p class="load-problem">設定を読み込めませんでした。ページを再読み込みしてください。</p>
    {/if}
  </article>

  <SaveStatus {outcome} />
</main>

<style>
  :global(:root) {
    --page: #e9edf1;
    --surface: #ffffff;
    --surface-sunken: #f2f4f7;
    --ink: #1c2430;
    --ink-muted: #586474;
    --ink-faint: #9aa3af;
    --line: #dce1e7;
    --line-strong: #b9c1cb;
    --accent: #007b83;
    --switch-off: #c3cad3;
    --danger: #c5221f;

    --group-grey: #5f6368;
    --group-blue: #1a73e8;
    --group-red: #d93025;
    --group-yellow: #f9ab00;
    --group-green: #1e8e3e;
    --group-pink: #d01884;
    --group-purple: #9334e6;
    --group-cyan: #007b83;
    --group-orange: #fa903e;

    --font-body:
      "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", system-ui,
      sans-serif;
    --font-display: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
    --font-numeric: ui-monospace, "SF Mono", Menlo, monospace;

    color-scheme: light dark;
  }

  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --page: #11151a;
      --surface: #1a2027;
      --surface-sunken: #141a20;
      --ink: #e4e8ed;
      --ink-muted: #9aa5b3;
      --ink-faint: #5e6875;
      --line: #2a323c;
      --line-strong: #3c4652;
      --accent: #3fb8c0;
      --switch-off: #3c4652;
      --danger: #f28b82;

      --group-grey: #dadce0;
      --group-blue: #8ab4f8;
      --group-red: #f28b82;
      --group-yellow: #fdd663;
      --group-green: #81c995;
      --group-pink: #ff8bcb;
      --group-purple: #c58af9;
      --group-cyan: #78d9ec;
      --group-orange: #fcad70;
    }
  }

  :global(body) {
    margin: 0;
    background: var(--page);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 0.9375rem;
    -webkit-font-smoothing: antialiased;
  }

  main {
    padding: 56px 16px 96px;
  }

  .sheet {
    position: relative;
    max-width: 640px;
    margin: 0 auto;
    padding: 36px 40px 20px;
    border: 1px solid var(--line);
    border-radius: 4px 4px 12px 12px;
    background: var(--surface);
  }

  .index-tabs {
    position: absolute;
    bottom: 100%;
    right: 32px;
    display: flex;
    gap: 3px;
  }

  .index-tabs span {
    width: 22px;
    height: 7px;
    border-radius: 3px 3px 0 0;
  }

  header {
    padding-bottom: 20px;
  }

  .wordmark {
    margin: 0;
    color: var(--ink-muted);
    font-family: var(--font-display);
    font-size: 0.8125rem;
    letter-spacing: 0.24em;
  }

  h1 {
    margin: 4px 0 0;
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 600;
    letter-spacing: 0.08em;
  }

  .lede {
    margin: 8px 0 0;
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  section {
    padding-top: 20px;
    border-top: 1px solid var(--line-strong);
  }

  section + section {
    margin-top: 12px;
  }

  h2 {
    margin: 0;
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  section :global(.setting + .setting) {
    border-top: 1px solid var(--line);
  }

  .load-problem {
    margin: 0;
    padding: 20px 0;
    border-top: 1px solid var(--line-strong);
    color: var(--danger);
    font-weight: 600;
  }

  @media (max-width: 480px) {
    main {
      padding-top: 40px;
    }

    .sheet {
      padding: 28px 20px 12px;
    }

    .index-tabs {
      right: 16px;
    }

    .index-tabs span {
      width: 16px;
    }
  }
</style>
