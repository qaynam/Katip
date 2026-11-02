import { Option } from "effect"
import {
  dropOutcome,
  type DragSource,
  type DropContext,
  type DropOutcome,
  type DropTarget,
  type FolderZone,
  type RowZone,
} from "../logic/drag-drop"

export type DropZone = RowZone | FolderZone

export interface DropIndicator {
  readonly key: string
  readonly zone: DropZone
}

// Native drag and drop doesn't let drop targets read the dataTransfer contents, so the drag
// source is kept here. External drags (links, files) leave source null and can be ignored
export class DragSession {
  source = $state.raw<DragSource | null>(null)
  sourceKey = $state.raw<string | null>(null)
  indicator = $state.raw<DropIndicator | null>(null)
  #outcome: DropOutcome | null = null
  #hover: { readonly key: string; readonly timer: ReturnType<typeof setTimeout> } | null = null
  readonly #context: () => DropContext

  constructor(context: () => DropContext) {
    this.#context = context
  }

  begin(event: DragEvent, key: string, source: DragSource) {
    event.stopPropagation()
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("application/x-katip", "")
    }
    this.source = source
    this.sourceKey = key
  }

  /** Calls preventDefault, which lets the browser drop, only on targets that accept the drop. */
  offer(event: DragEvent, key: string, zone: DropZone, target: DropTarget | null) {
    event.stopPropagation()
    if (this.#hover !== null && this.#hover.key !== key) this.cancelHover()
    const outcome = target === null ? Option.none() : this.#outcomeFor(target)
    if (Option.isNone(outcome)) {
      this.reject()
      return
    }
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
    this.#outcome = outcome.value
    if (this.indicator?.key !== key || this.indicator.zone !== zone) {
      this.indicator = { key, zone }
    }
  }

  accepts(target: DropTarget): boolean {
    return Option.isSome(this.#outcomeFor(target))
  }

  #outcomeFor(target: DropTarget): Option.Option<DropOutcome> {
    return this.source === null ? Option.none() : dropOutcome(this.source, target, this.#context())
  }

  /**
   * Keeps the previous candidate over the gaps between rows, so the insertion line doesn't
   * flicker as the candidate briefly disappears.
   */
  keep(event: DragEvent) {
    event.stopPropagation()
    if (this.#outcome !== null) event.preventDefault()
  }

  reject() {
    this.#outcome = null
    this.indicator = null
  }

  zoneFor(key: string): DropZone | null {
    return this.indicator?.key === key ? this.indicator.zone : null
  }

  /** Takes the outcome for the last accepted drop target and ends the drag. */
  takeOutcome(): DropOutcome | null {
    const outcome = this.#outcome
    this.end()
    return outcome
  }

  end() {
    this.cancelHover()
    this.#outcome = null
    this.indicator = null
    this.source = null
    this.sourceKey = null
  }

  /** Runs action once the pointer has stayed over the same key for delayMs. */
  hoverFor(key: string, action: () => void, delayMs = 250) {
    if (this.#hover?.key === key) return
    this.cancelHover()
    const timer = setTimeout(() => {
      this.#hover = null
      action()
    }, delayMs)
    this.#hover = { key, timer }
  }

  cancelHover() {
    if (this.#hover === null) return
    clearTimeout(this.#hover.timer)
    this.#hover = null
  }
}
