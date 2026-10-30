import type { Point } from "../logic/menu-position"

export interface TooltipContent {
  readonly title: string
  readonly hint?: string
}

export interface ShownTooltip extends TooltipContent {
  readonly at: Point
}

export class TooltipController {
  current = $state.raw<ShownTooltip | null>(null)
  #pending: { content: TooltipContent; at: Point; timer: ReturnType<typeof setTimeout> } | null =
    null
  readonly #delayMs: number

  constructor(delayMs = 650) {
    this.#delayMs = delayMs
  }

  /** ポインタが delayMs 留まったら、その時点のポインタの位置に出す */
  schedule(content: TooltipContent, at: Point) {
    this.hide()
    const timer = setTimeout(() => {
      const pending = this.#pending
      this.#pending = null
      if (pending !== null) this.current = { ...pending.content, at: pending.at }
    }, this.#delayMs)
    this.#pending = { content, at, timer }
  }

  follow(at: Point) {
    if (this.#pending !== null) this.#pending.at = at
  }

  hide() {
    if (this.#pending !== null) clearTimeout(this.#pending.timer)
    this.#pending = null
    this.current = null
  }
}
