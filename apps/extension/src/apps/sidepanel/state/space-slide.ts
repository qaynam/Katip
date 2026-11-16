import { Option } from "effect"
import {
  enteringSide,
  oppositeSide,
  switchDirection,
  type Side,
  type SpaceOrder,
} from "../logic/space-slide"
import { isSamePage, type SidebarPage } from "../logic/swipe"

/** Which way the page showing a Space, or the new Space being named, slides each time it changes. */
export class SpaceSlide {
  /** Where the page switched to last came in from, or null when it took the place without moving. */
  entersFrom: Side | null = null
  #shown: SidebarPage
  #order: SpaceOrder

  constructor(spaces: SpaceOrder, shown: SidebarPage) {
    this.#order = spaces
    this.#shown = shown
  }

  get leavesTo(): Side | null {
    return this.entersFrom === null ? null : oppositeSide(this.entersFrom)
  }

  /** Call with every view, before the page it shows is drawn. */
  follow(spaces: SpaceOrder, shown: SidebarPage) {
    if (!isSamePage(this.#shown, shown)) {
      this.entersFrom = Option.getOrNull(
        Option.map(switchDirection(this.#order, spaces, this.#shown, shown), enteringSide),
      )
      this.#shown = shown
    }
    this.#order = spaces
  }
}
