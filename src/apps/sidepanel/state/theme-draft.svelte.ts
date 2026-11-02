import { Schema } from "effect"
import type { SpaceId } from "#modules/space"
import { SpaceTheme } from "#modules/theme"
import type { CommandOutcome } from "#protocol"
import { createCoalescingSender, type CoalescingSender } from "./coalescing-sender"

export interface DraftTheme {
  readonly spaceId: SpaceId
  readonly theme: SpaceTheme
}

const sameTheme = Schema.toEquivalence(SpaceTheme)

// The theme being edited is painted locally without waiting for the background round trip, and
// sent to the background at a throttled rate. Painting from the view would make the color lag
// behind the pointer while dragging
export class ThemeDraft {
  current = $state.raw<DraftTheme | null>(null)
  #isReleased = $state(false)
  readonly #sender: CoalescingSender<DraftTheme>

  constructor(send: (draft: DraftTheme) => Promise<CommandOutcome>, intervalMs = 150) {
    this.#sender = createCoalescingSender({
      intervalMs,
      isSame: (a, b) => a.spaceId === b.spaceId && sameTheme(a.theme, b.theme),
      send: (draft) => {
        void send(draft).then((outcome) => {
          if (outcome._tag === "Failed" && this.#isReleased) this.current = null
        })
      },
    })
  }

  themeFor(spaceId: SpaceId): SpaceTheme | null {
    return this.current?.spaceId === spaceId ? this.current.theme : null
  }

  /**
   * For values that keep changing, such as during a drag. Paints locally at once and sends to
   * the background at a throttled rate.
   */
  preview(spaceId: SpaceId, theme: SpaceTheme) {
    this.#isReleased = false
    this.current = { spaceId, theme }
    this.#sender.push(this.current)
  }

  /** Sends the latest value without waiting for the interval. */
  settle() {
    this.#sender.flush()
  }

  commit(spaceId: SpaceId, theme: SpaceTheme) {
    this.preview(spaceId, theme)
    this.settle()
  }

  /** Ends editing. The draft stays painted until the view catches up with the same theme. */
  release() {
    this.settle()
    this.#isReleased = true
  }

  /**
   * Discards a released draft once the theme in the view has caught up with it.
   *
   * @param viewTheme - The view's theme for the draft's Space, or null if that Space is gone.
   */
  settleWith(viewTheme: SpaceTheme | null) {
    const draft = this.current
    if (draft === null || !this.#isReleased) return
    if (viewTheme === null || sameTheme(viewTheme, draft.theme)) this.current = null
  }
}
