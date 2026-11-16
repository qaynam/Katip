import type { SpaceId } from "#modules/space"
import type { SpaceDraft } from "../logic/space-draft"

interface ShownDraft {
  readonly draft: SpaceDraft
  readonly shownOver: SpaceId
}

/**
 * A new Space shown as a page after the last Space while it's being named. Nothing is created
 * until the name is confirmed, so giving the draft up leaves no trace.
 */
export class SpaceDraftController {
  #shown = $state.raw<ShownDraft | null>(null)

  get current(): SpaceDraft | null {
    return this.#shown?.draft ?? null
  }

  /** Shows the draft in place of the Space that is active now. */
  open(draft: SpaceDraft, activeSpaceId: SpaceId) {
    this.#shown = { draft, shownOver: activeSpaceId }
  }

  discard() {
    this.#shown = null
  }

  /**
   * Whether the draft is shown while `activeSpaceId` is active. Once another Space is active, such
   * as the one created from the draft, the draft is no longer shown.
   */
  isShownWith(activeSpaceId: SpaceId): boolean {
    return this.#shown?.shownOver === activeSpaceId
  }

  /** Gives the draft up once another Space is active, so it doesn't come back with the first. */
  settleWith(activeSpaceId: SpaceId) {
    if (this.#shown !== null && !this.isShownWith(activeSpaceId)) this.discard()
  }
}
