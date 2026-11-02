<script lang="ts">
  import { Option, Result } from "effect"
  import { untrack } from "svelte"
  import type { MessageKey } from "#modules/i18n"
  import { GitHubQuery, type LiveSource } from "#modules/live-folders"
  import type { BookmarkId } from "#platform/browser"
  import type { SidebarCommand } from "#protocol"
  import {
    gitHubTokenFrom,
    gmailSourceFrom,
    type LiveFolderDraftError,
  } from "../logic/live-folder-drafts"
  import { GITHUB_TOKEN_PAGE_URL, liveSourceNames, sourceOrigins } from "../logic/live-folders"
  import { findPinnedNode } from "../logic/view-queries"
  import type { LiveFolderDialogRequest } from "../state/live-folder-dialog.svelte"
  import { getSidebarContext } from "../state/sidebar-context"

  interface Props {
    request: LiveFolderDialogRequest
    onClose: () => void
  }

  const { request, onClose }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)
  const ids = $props.id()

  const draftErrorMessages = {
    InvalidAccountIndex: "sidepanel.liveFolderDialog.invalidAccountIndex",
    TokenRequired: "sidepanel.liveFolderDialog.tokenRequired",
    TokenHasWhitespace: "sidepanel.liveFolderDialog.tokenHasWhitespace",
  } as const satisfies Record<LiveFolderDraftError, MessageKey>

  const gitHubQueryMessages = {
    "review-requested": "sidepanel.liveFolder.github.reviewRequested",
    "authored-pull-requests": "sidepanel.liveFolder.github.authoredPullRequests",
    "assigned-issues": "sidepanel.liveFolder.github.assignedIssues",
    mentioned: "sidepanel.liveFolder.github.mentioned",
  } as const satisfies Record<GitHubQuery, MessageKey>

  // The request may change while the dialog is open, but the set of fields is fixed when it
  // opens so that fields don't appear or disappear midway
  const initial = untrack(() => request)
  const kind = initial._tag === "Create" ? initial.kind : "GitHub"
  const titleMessage =
    initial._tag === "SetGitHubToken"
      ? "sidepanel.liveFolderDialog.tokenTitle"
      : kind === "Gmail"
        ? "sidepanel.liveFolderDialog.gmailTitle"
        : "sidepanel.liveFolderDialog.gitHubTitle"

  let accountIndex = $state("0")
  let label = $state("")
  let query = $state<GitHubQuery>("review-requested")
  let token = $state("")
  // Holds how to build the message rather than the string, so that a language change while it
  // is shown retranslates it
  let error = $state.raw<(() => string) | null>(null)
  let isSubmitting = $state(false)

  const showDraftError = (reason: LiveFolderDraftError) => {
    error = () => t(draftErrorMessages[reason])
  }

  const sourceDraft = (): Result.Result<LiveSource, LiveFolderDraftError> =>
    kind === "Gmail"
      ? gmailSourceFrom({ accountIndex, label })
      : Result.succeed({ _tag: "GitHub", query })

  const succeeds = async (command: SidebarCommand) => (await ctx.run(command))._tag === "Succeeded"

  const whileSubmitting = async (task: () => Promise<void>) => {
    isSubmitting = true
    try {
      await task()
    } finally {
      isSubmitting = false
    }
  }

  const expandFolder = (folderId: BookmarkId | null) => {
    const pinned = ctx.activeSpace.pinned
    if (folderId === null || pinned._tag === "Unavailable") return
    const folder = Option.getOrNull(findPinnedNode(pinned.nodes, folderId))
    if (folder?._tag === "PinnedFolder" && !folder.isExpanded) {
      void ctx.run({ _tag: "SetFolderExpanded", bookmarkId: folderId, isExpanded: true })
    }
  }

  const create = (target: Extract<LiveFolderDialogRequest, { _tag: "Create" }>) => {
    const draft = sourceDraft()
    if (Result.isFailure(draft)) {
      showDraftError(draft.failure)
      return
    }
    // Chrome only prompts while handling a user gesture, so ask before any await
    const access = ctx.originAccess.request(sourceOrigins(kind))
    void whileSubmitting(async () => {
      if (!(await access)) {
        error = () =>
          t("sidepanel.liveFolderDialog.accessDenied", { source: liveSourceNames[kind] })
        return
      }
      const isCreated = await succeeds({
        _tag: "CreateLiveFolder",
        spaceId: target.spaceId,
        parentId: target.parentId,
        source: draft.success,
      })
      if (!isCreated) return
      expandFolder(target.parentId)
      onClose()
    })
  }

  const saveToken = (bookmarkId: BookmarkId) => {
    const draft = gitHubTokenFrom(token)
    if (Result.isFailure(draft)) {
      showDraftError(draft.failure)
      return
    }
    void whileSubmitting(async () => {
      if (!(await succeeds({ _tag: "SetGitHubToken", token: draft.success }))) return
      void ctx.run({ _tag: "RefreshLiveFolder", bookmarkId })
      onClose()
    })
  }

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    if (isSubmitting) return
    if (request._tag === "Create") create(request)
    else saveToken(request.bookmarkId)
  }

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    onClose()
  }

  const focusFirstField = (form: HTMLFormElement) => form.querySelector("input")?.focus()
</script>

<svelte:window onkeydown={closeOnEscape} />

<div class="scrim">
  <div class="dialog glass" role="dialog" aria-modal="true" aria-labelledby="{ids}-title">
    <form
      class="form"
      novalidate
      onsubmit={submit}
      oninput={() => (error = null)}
      {@attach focusFirstField}
    >
      <h2 id="{ids}-title" class="title">{t(titleMessage)}</h2>

      {#if initial._tag === "Create" && kind === "Gmail"}
        <p class="description">{t("sidepanel.liveFolderDialog.gmailDescription")}</p>
        <div class="field">
          <label class="label" for="{ids}-account"
            >{t("sidepanel.liveFolderDialog.accountIndex")}</label
          >
          <input
            id="{ids}-account"
            type="text"
            inputmode="numeric"
            aria-describedby="{ids}-account-hint"
            bind:value={accountIndex}
          />
          <p id="{ids}-account-hint" class="hint">
            {t("sidepanel.liveFolderDialog.accountIndexHint")}
          </p>
        </div>
        <div class="field">
          <label class="label" for="{ids}-label">{t("sidepanel.liveFolderDialog.label")}</label>
          <input
            id="{ids}-label"
            type="text"
            placeholder={t("sidepanel.liveFolderDialog.labelPlaceholder")}
            aria-describedby="{ids}-label-hint"
            bind:value={label}
          />
          <p id="{ids}-label-hint" class="hint">{t("sidepanel.liveFolderDialog.labelHint")}</p>
        </div>
      {:else if initial._tag === "Create"}
        <p class="description">{t("sidepanel.liveFolderDialog.gitHubDescription")}</p>
        <fieldset class="queries">
          <legend class="label">{t("sidepanel.liveFolderDialog.queryLegend")}</legend>
          {#each GitHubQuery.literals as option (option)}
            <label class="query">
              <input type="radio" name="{ids}-query" value={option} bind:group={query} />
              <span>{t(gitHubQueryMessages[option])}</span>
            </label>
          {/each}
        </fieldset>
      {/if}

      {#if initial._tag === "SetGitHubToken"}
        <div class="field">
          <label class="label" for="{ids}-token">{t("sidepanel.liveFolderDialog.token")}</label>
          <input
            id="{ids}-token"
            type="password"
            autocomplete="off"
            spellcheck="false"
            aria-describedby="{ids}-token-help"
            bind:value={token}
          />
          <p id="{ids}-token-help" class="hint">{t("sidepanel.liveFolderDialog.tokenHowTo")}</p>
        </div>
        <a class="token-link" href={GITHUB_TOKEN_PAGE_URL} target="_blank" rel="noreferrer">
          {t("sidepanel.liveFolderDialog.tokenLink")}
        </a>
      {/if}

      {#if error !== null}
        <p class="error" role="alert">{error()}</p>
      {/if}

      <div class="actions">
        <button class="cancel" type="button" onclick={onClose}>{t("common.cancel")}</button>
        <button class="submit" type="submit" disabled={isSubmitting}>
          {t(
            initial._tag === "Create"
              ? "sidepanel.liveFolderDialog.create"
              : "sidepanel.liveFolderDialog.save",
          )}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgb(0 0 0 / 0.18);
    animation: fade-in 140ms ease-out;
  }

  .dialog {
    width: 100%;
    max-width: 320px;
    max-height: 100%;
    padding: 18px 16px 14px;
    overflow-y: auto;
    border-radius: 14px;
    font-size: 12.5px;
    animation: dialog-in 160ms ease-out;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
  }

  .description {
    margin: -4px 0 0;
    color: var(--glass-muted);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .label {
    font-weight: 600;
  }

  .field input {
    height: 30px;
    padding: 0 9px;
    border: none;
    border-radius: 7px;
    outline: 0.5px solid var(--glass-border);
    background: var(--glass-hover);
    color: var(--glass-text);
  }

  .field input:focus-visible {
    outline: 1.5px solid color-mix(in srgb, var(--glass-text) 45%, transparent);
  }

  .hint {
    margin: 0;
    color: var(--glass-muted);
    font-size: 11.5px;
    line-height: 1.5;
  }

  .queries {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    border: none;
  }

  .queries legend {
    margin-bottom: 4px;
    padding: 0;
  }

  .query {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    padding: 0 8px;
    border-radius: 7px;
  }

  .query:hover,
  .query:has(input:checked) {
    background: var(--glass-hover);
  }

  .query input {
    margin: 0;
    accent-color: currentColor;
  }

  .token-link {
    align-self: flex-start;
    color: inherit;
    font-size: 12px;
    font-weight: 600;
  }

  .error {
    margin: 0;
    color: var(--danger);
    line-height: 1.5;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .actions button {
    height: 28px;
    padding: 0 14px;
    border: none;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 600;
  }

  .cancel {
    background: var(--glass-hover);
  }

  .submit {
    background: var(--glass-text);
    color: Canvas;
  }

  .submit:disabled {
    opacity: 0.5;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }

  @keyframes dialog-in {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scrim,
    .dialog {
      animation: none;
    }
  }
</style>
