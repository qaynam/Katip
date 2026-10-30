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

// 編集中のテーマは background の往復を待たずに手元で塗り、background へは間引いて送る。
// ビューに届いたテーマで塗ると、ドラッグ中に色が指から遅れて追いかけてくる
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

  /** ドラッグ中など、続けて変わっていく値。手元ではすぐ塗り、background へは間引いて送る */
  preview(spaceId: SpaceId, theme: SpaceTheme) {
    this.#isReleased = false
    this.current = { spaceId, theme }
    this.#sender.push(this.current)
  }

  /** ここまでの値を待たずに送る */
  settle() {
    this.#sender.flush()
  }

  commit(spaceId: SpaceId, theme: SpaceTheme) {
    this.preview(spaceId, theme)
    this.settle()
  }

  /** 編集を終える。下書きはビューが同じテーマに追いつくまで塗り続ける */
  release() {
    this.settle()
    this.#isReleased = true
  }

  /**
   * 編集を終えた下書きが、ビューに届いたテーマに追いついていれば捨てる。
   *
   * @param viewTheme - ビューにある、下書きと同じ Space のテーマ。Space が消えていれば null
   */
  settleWith(viewTheme: SpaceTheme | null) {
    const draft = this.current
    if (draft === null || !this.#isReleased) return
    if (viewTheme === null || sameTheme(viewTheme, draft.theme)) this.current = null
  }
}
