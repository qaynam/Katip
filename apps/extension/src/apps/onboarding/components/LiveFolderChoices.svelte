<script lang="ts">
  import type { Translator } from "#modules/i18n"
  import { type LiveSource, originPatternOfKind } from "#modules/live-folders"
  import type { SpaceId } from "#modules/space"
  import type { CommandOutcome, SidebarCommand } from "#protocol"
  import type { OriginAccess } from "../../sidepanel/connection/origin-access"
  import type { Undelivered } from "../../sidepanel/connection/sidebar-connection"

  let {
    t,
    spaceId,
    spaceName,
    run,
    originAccess,
    faviconUrl,
  }: {
    t: Translator["t"]
    /** The Space the live folders are added to. */
    spaceId: SpaceId
    spaceName: string
    run: (command: SidebarCommand) => Promise<CommandOutcome | Undelivered>
    originAccess: OriginAccess
    faviconUrl: (pageUrl: string) => string | null
  } = $props()

  interface Choice {
    readonly key: string
    readonly service: "Gmail" | "GitHub"
    readonly label:
      | "onboarding.liveFolders.gmail"
      | "sidepanel.liveFolder.github.reviewRequested"
      | "sidepanel.liveFolder.github.authoredPullRequests"
      | "sidepanel.liveFolder.github.assignedIssues"
      | "sidepanel.liveFolder.github.mentioned"
    readonly source: LiveSource
  }

  // The inbox of the first account signed in, which is what most people mean by their mail
  const CHOICES: ReadonlyArray<Choice> = [
    {
      key: "gmail",
      service: "Gmail",
      label: "onboarding.liveFolders.gmail",
      source: { _tag: "Gmail", accountIndex: 0, label: null },
    },
    {
      key: "review-requested",
      service: "GitHub",
      label: "sidepanel.liveFolder.github.reviewRequested",
      source: { _tag: "GitHub", query: "review-requested" },
    },
    {
      key: "authored-pull-requests",
      service: "GitHub",
      label: "sidepanel.liveFolder.github.authoredPullRequests",
      source: { _tag: "GitHub", query: "authored-pull-requests" },
    },
    {
      key: "assigned-issues",
      service: "GitHub",
      label: "sidepanel.liveFolder.github.assignedIssues",
      source: { _tag: "GitHub", query: "assigned-issues" },
    },
    {
      key: "mentioned",
      service: "GitHub",
      label: "sidepanel.liveFolder.github.mentioned",
      source: { _tag: "GitHub", query: "mentioned" },
    },
  ]

  const SITES = { Gmail: "https://mail.google.com/", GitHub: "https://github.com/" } as const

  type Progress =
    | { readonly _tag: "Adding" }
    | { readonly _tag: "Added" }
    | { readonly _tag: "Failed"; readonly message: string }

  let progress = $state.raw<ReadonlyMap<string, Progress>>(new Map())

  const settle = (key: string, next: Progress) => {
    progress = new Map([...progress, [key, next]])
  }

  const add = (choice: Choice) => {
    // Chrome only asks for access while handling the press, so it is asked before any await
    const access = originAccess.request([originPatternOfKind(choice.source._tag)])
    settle(choice.key, { _tag: "Adding" })
    void (async () => {
      if (!(await access)) {
        settle(choice.key, {
          _tag: "Failed",
          message: t("sidepanel.liveFolderDialog.accessDenied", { source: choice.service }),
        })
        return
      }
      const outcome = await run({
        _tag: "CreateLiveFolder",
        spaceId,
        parentId: null,
        source: choice.source,
      })
      settle(
        choice.key,
        outcome._tag === "Succeeded"
          ? { _tag: "Added" }
          : { _tag: "Failed", message: t("onboarding.liveFolders.failed") },
      )
    })()
  }
</script>

<div class="choices">
  <p class="into">{t("onboarding.liveFolders.into", { space: spaceName })}</p>
  <ul>
    {#each CHOICES as choice (choice.key)}
      {@const state = progress.get(choice.key)}
      {@const icon = faviconUrl(SITES[choice.service])}
      {@const labelId = `live-folder-${choice.key}`}
      <li>
        <span class="tile" aria-hidden="true">
          {#if icon !== null}<img src={icon} alt="" width="16" height="16" />{/if}
        </span>
        <span class="text">
          <span id={labelId} class="name">{choice.service} · {t(choice.label)}</span>
          {#if state?._tag === "Failed"}
            <span class="failure">{state.message}</span>
          {/if}
        </span>
        {#if state?._tag === "Added"}
          <span class="added">{t("onboarding.liveFolders.added")}</span>
        {:else}
          <button
            type="button"
            class="button secondary small"
            aria-describedby={labelId}
            disabled={state?._tag === "Adding"}
            onclick={() => add(choice)}
          >
            {t("onboarding.liveFolders.add")}
          </button>
        {/if}
      </li>
    {/each}
  </ul>
</div>

<style>
  .choices {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .into {
    margin: 0;
    color: var(--ink-secondary);
    font-size: 0.875rem;
  }

  ul {
    margin: 0;
    padding: 0.25rem 0.875rem;
    border-radius: 1rem;
    background: var(--stage);
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 3.25rem;
  }

  li + li {
    border-top: 1px solid var(--hairline);
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

  .name {
    font-weight: 500;
  }

  .failure {
    color: var(--warning);
    font-size: 0.8125rem;
  }

  .added {
    color: var(--accent);
    font-weight: 500;
  }
</style>
