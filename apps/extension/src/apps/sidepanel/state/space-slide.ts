import type { SpaceId } from "#modules/space"
import {
  enteringSide,
  oppositeSide,
  switchDirection,
  type Side,
  type SpaceOrder,
} from "../logic/space-slide"
import type { SwipeDirection } from "../logic/swipe"

interface ExpectedSwipe {
  readonly destination: SpaceId
  readonly direction: SwipeDirection
}

/** Which way the Space contents slide each time the shown Space changes. */
export class SpaceSlide {
  /** Where the Space switched to last came in from. */
  entersFrom: Side = "right"
  #shownId: SpaceId
  #order: SpaceOrder
  #swipe: ExpectedSwipe | null = null

  constructor(spaces: SpaceOrder, shownId: SpaceId) {
    this.#order = spaces
    this.#shownId = shownId
  }

  get leavesTo(): Side {
    return oppositeSide(this.entersFrom)
  }

  /**
   * Slides the way of the swipe once the Space it switches to is shown, even when the swipe wrapped
   * around from one end of the Spaces to the other.
   */
  expectSwipe(destination: SpaceId, direction: SwipeDirection) {
    this.#swipe = { destination, direction }
  }

  /** Call with every view, before the Space it shows is drawn. */
  follow(spaces: SpaceOrder, shownId: SpaceId) {
    if (shownId !== this.#shownId) {
      const direction =
        this.#swipe?.destination === shownId
          ? this.#swipe.direction
          : switchDirection(this.#order, spaces, this.#shownId, shownId)
      this.entersFrom = enteringSide(direction)
      this.#swipe = null
      this.#shownId = shownId
    }
    this.#order = spaces
  }
}
