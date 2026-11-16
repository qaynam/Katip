<script lang="ts">
  import { Option, Schema } from "effect"
  import { untrack } from "svelte"
  import { SpaceName } from "#modules/space"
  import type { SpaceDraft } from "../logic/space-draft"
  import { getSidebarContext } from "../state/sidebar-context"

  interface Props {
    draft: SpaceDraft
  }

  const { draft }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)
  const ids = $props.id()

  let name = $state(untrack(() => draft.name))
  let isCreating = $state(false)
  let page = $state<HTMLElement>()
  const confirmedName = $derived(Schema.decodeUnknownOption(SpaceName)(name))

  const create = async (event: SubmitEvent) => {
    event.preventDefault()
    if (Option.isNone(confirmedName) || isCreating) return
    isCreating = true
    ctx.spaceSetup.requestForNextCreated(new Set(ctx.view.spaces.map((space) => space.id)), {
      rename: false,
      editTheme: true,
    })
    const outcome = await ctx.run({
      _tag: "CreateSpace",
      windowId: ctx.view.windowId,
      name: confirmedName.value,
      theme: draft.theme,
    })
    if (outcome._tag === "Failed") {
      ctx.spaceSetup.cancel()
      isCreating = false
    }
  }

  const discardOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.isComposing) return
    event.preventDefault()
    event.stopPropagation()
    ctx.spaceDraft.discard()
  }

  // relatedTarget is null when focus leaves the side panel, which gives the draft up as well
  const discardWhenLeft = (event: FocusEvent) => {
    if (isCreating) return
    if (event.relatedTarget instanceof Node && page?.contains(event.relatedTarget)) return
    ctx.spaceDraft.discard()
  }

  const focusAndSelect = (input: HTMLInputElement) => {
    input.focus()
    input.select()
  }
</script>

<!-- Focusable so that a click on the page's empty space keeps focus within it -->
<section
  bind:this={page}
  class="new-space"
  tabindex="-1"
  aria-labelledby="{ids}-heading"
  onfocusout={discardWhenLeft}
>
  <h2 id="{ids}-heading" class="visually-hidden">{t("sidepanel.space.draft")}</h2>
  <form class="form" onsubmit={create}>
    <input
      class="name"
      type="text"
      aria-label={t("sidepanel.space.nameLabel")}
      bind:value={name}
      disabled={isCreating}
      onkeydown={discardOnEscape}
      {@attach focusAndSelect}
    />
    <p class="hint">{t("sidepanel.space.draftHint")}</p>
    <div class="actions">
      <button class="action" type="button" onclick={() => ctx.spaceDraft.discard()}>
        {t("common.cancel")}
      </button>
      <button
        class="action primary"
        type="submit"
        disabled={Option.isNone(confirmedName) || isCreating}
      >
        {t("sidepanel.space.draftCreate")}
      </button>
    </div>
  </form>
</section>

<style>
  .new-space {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    outline: none;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 6px 8px 0;
  }

  .name {
    height: 32px;
    padding: 0 9px;
    border: none;
    border-radius: 8px;
    outline: 1.5px solid var(--focus-ring);
    background: var(--surface-active);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
  }

  .hint {
    margin: 0 2px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.45;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .action {
    height: 28px;
    padding: 0 12px;
    border: none;
    border-radius: 8px;
    background: var(--surface-raised);
    color: var(--text);
    font: inherit;
    font-size: 12px;
  }

  .action:hover:not(:disabled) {
    background: var(--surface-hover);
  }

  .action.primary {
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
    font-weight: 600;
  }

  .action:disabled {
    opacity: 0.5;
  }
</style>
