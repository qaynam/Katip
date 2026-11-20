<script lang="ts">
  import { Option } from "effect"
  import { onMount } from "svelte"
  import { hostOfSite, originPatternOfSite, soundSiteOf } from "#modules/sound"
  import type { TabSoundView } from "#protocol"
  import { findTabView } from "../logic/view-queries"
  import { getSidebarContext } from "../state/sidebar-context"
  import type { SoundDialogRequest } from "../state/sound-dialog.svelte"

  interface Props {
    request: SoundDialogRequest
    onClose: () => void
  }

  const { request, onClose }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)
  const ids = $props.id()
  // svelte-ignore state_referenced_locally
  const { tabId } = request

  const tab = $derived(findTabView(ctx.view, tabId))
  const site = $derived(Option.flatMap(tab, (open) => soundSiteOf(open.url)))
  const host = $derived(Option.match(site, { onNone: () => "", onSome: hostOfSite }))
  const sound = $derived(
    Option.getOrUndefined(Option.flatMap(tab, (open) => Option.fromNullishOr(open.sound))),
  )
  const icon = $derived(
    Option.getOrNull(Option.flatMap(tab, (open) => Option.fromNullishOr(ctx.faviconUrl(open.url)))),
  )

  type Step =
    | { readonly _tag: "Checking" }
    | { readonly _tag: "AccessDenied" }
    | { readonly _tag: "AskingMicrophone" }
    | { readonly _tag: "MicrophoneRefused" }
    | { readonly _tag: "MicrophoneBlocked" }
    | { readonly _tag: "Unreachable" }
    | { readonly _tag: "Choosing"; readonly outputs: ReadonlyArray<string> }

  let step = $state.raw<Step>({ _tag: "Checking" })
  // svelte-ignore state_referenced_locally
  let output = $state<string | null>(sound?.output ?? null)
  // svelte-ignore state_referenced_locally
  let scope = $state<TabSoundView["scope"]>(sound?.scope ?? "Site")
  let isBusy = $state(false)

  // The tab closed, or moved to a page that isn't on the web: there is nothing left to set
  $effect(() => {
    if (Option.isNone(site)) onClose()
  })

  // Asked without waiting for another click: the panel already says why, and Chrome asks on the
  // page, so this is the only question the person answers there
  const askForMicrophone = async () => {
    step = { _tag: "AskingMicrophone" }
    // Chrome asks on the page, which must be in front for the question to show
    await ctx.run({ _tag: "ActivateTab", tabId })
    const answer = await ctx.pageOutputs.askForMicrophone(tabId)
    if (answer === "Allowed") await listOutputs({ asksForMicrophone: false })
    else step = { _tag: answer === "Blocked" ? "MicrophoneBlocked" : "MicrophoneRefused" }
  }

  const listOutputs = async ({ asksForMicrophone }: { readonly asksForMicrophone: boolean }) => {
    const listed = await ctx.pageOutputs.list(tabId)
    if (listed._tag === "Listed") step = { _tag: "Choosing", outputs: listed.outputs }
    else if (listed._tag === "Unreachable") step = { _tag: "Unreachable" }
    else if (asksForMicrophone) await askForMicrophone()
    else step = { _tag: "MicrophoneRefused" }
  }

  const proceed = async (access: Promise<boolean>) => {
    if (await access) await listOutputs({ asksForMicrophone: true })
    else step = { _tag: "AccessDenied" }
  }

  onMount(() => void proceed(request.access))

  const allowAccess = () => {
    if (Option.isNone(site)) return
    // Chrome asks only while handling the click, so before any await
    const asked = ctx.originAccess.request([originPatternOfSite(site.value)])
    isBusy = true
    void proceed(asked).finally(() => (isBusy = false))
  }

  const askAgain = () => {
    isBusy = true
    void askForMicrophone().finally(() => (isBusy = false))
  }

  // An output chosen before stays listed while it isn't connected, so the choice isn't lost
  const choices = $derived(
    step._tag !== "Choosing"
      ? []
      : sound?.output != null && !step.outputs.includes(sound.output)
        ? [...step.outputs, sound.output]
        : step.outputs,
  )

  const apply = async (event: SubmitEvent) => {
    event.preventDefault()
    isBusy = true
    const outcome = await ctx.run({ _tag: "SetTabSoundOutput", tabId, output, scope })
    isBusy = false
    if (outcome._tag === "Succeeded") onClose()
  }

  const reset = async () => {
    isBusy = true
    await ctx.run({ _tag: "ResetTabSound", tabId })
    isBusy = false
    onClose()
  }

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    onClose()
  }
</script>

<svelte:window onkeydown={closeOnEscape} />

<div class="scrim">
  <div class="dialog glass" role="dialog" aria-modal="true" aria-labelledby="{ids}-title">
    <form class="form" novalidate onsubmit={apply}>
      <div class="heading">
        <h2 id="{ids}-title" class="title">{t("sidepanel.sound.title")}</h2>
        <p class="site">
          {#if icon !== null}<img src={icon} alt="" width="14" height="14" />{/if}
          <span>{host}</span>
        </p>
      </div>

      {#if step._tag === "Checking"}
        <p class="description" role="status">{t("sidepanel.sound.checking")}</p>
      {:else if step._tag === "AccessDenied"}
        <p class="description" role="alert">{t("sidepanel.sound.accessDenied", { site: host })}</p>
      {:else if step._tag === "AskingMicrophone" || step._tag === "MicrophoneRefused"}
        <p class="lead" role="status">{t("sidepanel.sound.askingMicrophone", { site: host })}</p>
        <p class="note">{t("sidepanel.sound.microphoneNote")}</p>
        {#if step._tag === "MicrophoneRefused"}
          <p class="error" role="alert">{t("sidepanel.sound.microphoneRefused", { site: host })}</p>
        {/if}
      {:else if step._tag === "MicrophoneBlocked"}
        <p class="error" role="alert">{t("sidepanel.sound.microphoneBlocked", { site: host })}</p>
        <p class="note">{t("sidepanel.sound.microphoneNote")}</p>
      {:else if step._tag === "Unreachable"}
        <p class="description">{t("sidepanel.sound.unreachable")}</p>
      {:else}
        <fieldset class="choices">
          <legend class="label">{t("sidepanel.sound.outputLegend")}</legend>
          <label class="choice">
            <input type="radio" name="{ids}-output" value={null} bind:group={output} />
            <span>{t("sidepanel.sound.defaultOutput")}</span>
          </label>
          {#each choices as choice (choice)}
            <label class="choice">
              <input type="radio" name="{ids}-output" value={choice} bind:group={output} />
              <span>
                {step.outputs.includes(choice)
                  ? choice
                  : t("sidepanel.sound.disconnected", { output: choice })}
              </span>
            </label>
          {/each}
        </fieldset>
        <fieldset class="choices">
          <legend class="label">{t("sidepanel.sound.scopeLegend")}</legend>
          <label class="choice">
            <input type="radio" name="{ids}-scope" value="Site" bind:group={scope} />
            <span>{t("sidepanel.sound.scopeSite", { site: host })}</span>
          </label>
          <label class="choice">
            <input type="radio" name="{ids}-scope" value="Tab" bind:group={scope} />
            <span>{t("sidepanel.sound.scopeTab")}</span>
          </label>
        </fieldset>
      {/if}

      <div class="actions">
        {#if sound !== undefined}
          <button class="reset" type="button" disabled={isBusy} onclick={() => void reset()}>
            {t("sidepanel.sound.reset")}
          </button>
        {/if}
        <button class="cancel" type="button" onclick={onClose}>{t("common.cancel")}</button>
        {#if step._tag === "AccessDenied"}
          <button class="submit" type="button" disabled={isBusy} onclick={allowAccess}>
            {t("sidepanel.sound.allowAccess")}
          </button>
        {:else if step._tag === "MicrophoneRefused"}
          <button class="submit" type="button" disabled={isBusy} onclick={askAgain}>
            {t("sidepanel.sound.askAgain")}
          </button>
        {:else if step._tag === "MicrophoneBlocked"}
          <button
            class="cancel"
            type="button"
            onclick={() => Option.map(site, (s) => ctx.pageOutputs.openSiteSettings(s))}
          >
            {t("sidepanel.sound.openSiteSettings")}
          </button>
          <button class="submit" type="button" disabled={isBusy} onclick={askAgain}>
            {t("sidepanel.sound.askAgain")}
          </button>
        {:else if step._tag === "Choosing"}
          <button class="submit" type="submit" disabled={isBusy}>
            {t("sidepanel.sound.apply")}
          </button>
        {/if}
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
    gap: 12px;
  }

  .heading {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
  }

  .site {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin: 0;
    color: var(--glass-muted);
  }

  .site img {
    flex: none;
    border-radius: 3px;
  }

  .site span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .description {
    margin: 0;
    color: var(--glass-muted);
    line-height: 1.5;
  }

  .lead {
    margin: 0;
    line-height: 1.5;
  }

  .note {
    margin: 0;
    color: var(--glass-muted);
    font-size: 11.5px;
    line-height: 1.5;
  }

  .label {
    font-weight: 600;
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    border: none;
  }

  .choices legend {
    margin-bottom: 4px;
    padding: 0;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    padding: 0 8px;
    border-radius: 7px;
  }

  .choice span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .choice:hover,
  .choice:has(input:checked) {
    background: var(--glass-hover);
  }

  .choice input {
    flex: none;
    margin: 0;
    accent-color: currentColor;
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

  .reset {
    margin-right: auto;
    background: none;
    color: var(--danger);
  }

  .cancel {
    background: var(--glass-hover);
  }

  .submit {
    background: var(--glass-text);
    color: Canvas;
  }

  .submit:disabled,
  .reset:disabled {
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
