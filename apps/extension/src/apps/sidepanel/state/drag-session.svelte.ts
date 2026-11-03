import { Option } from "effect"
import type { WindowId } from "#platform/browser"
import type { SidebarCommand } from "#protocol"
import {
  commandForPageDrop,
  dropOutcome,
  type DragSource,
  type DropContext,
  type DropOutcome,
  type DropTarget,
  type FolderZone,
  type PanelBounds,
  type RowZone,
} from "../logic/drag-drop"

export type DropZone = RowZone | FolderZone

export interface DropIndicator {
  readonly key: string
  readonly zone: DropZone
}

export interface PageDropHandler {
  readonly windowId: () => WindowId
  readonly run: (command: SidebarCommand) => void
}

// Native drag and drop doesn't let drop targets read the dataTransfer contents, so the drag
// source is kept here. External drags (links, files) leave source null and can be ignored
export class DragSession {
  source = $state.raw<DragSource | null>(null)
  sourceKey = $state.raw<string | null>(null)
  indicator = $state.raw<DropIndicator | null>(null)
  #outcome: DropOutcome | null = null
  #hover: { readonly key: string; readonly timer: ReturnType<typeof setTimeout> } | null = null
  #panel: PanelBounds | null = null
  readonly #context: () => DropContext
  readonly #pageDrop: PageDropHandler

  constructor(context: () => DropContext, pageDrop: PageDropHandler) {
    this.#context = context
    this.#pageDrop = pageDrop
  }

  begin(event: DragEvent, key: string, source: DragSource) {
    event.stopPropagation()
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("application/x-katip", "")
    }
    this.source = source
    this.sourceKey = key
    // Taken while the pointer is still over the panel: the drag's end may be anywhere on screen
    this.#panel = {
      origin: { x: event.screenX - event.clientX, y: event.screenY - event.clientY },
      size: { width: window.innerWidth, height: window.innerHeight },
    }
  }

  /**
   * Ends the drag on its `dragend`. An open tab let go over the page, where nothing took the drop,
   * is handed to the background to split with the shown tab.
   */
  finish(event: DragEvent) {
    const source = this.source
    const panel = this.#panel
    this.end()
    // A drag cancelled with Escape over the page ends just like one let go there, with nothing
    // taking the drop, so it splits too: dragend tells the two apart in no browser
    if (source === null || panel === null) return
    const command = commandForPageDrop(
      source,
      {
        at: { x: event.screenX, y: event.screenY },
        dropEffect: event.dataTransfer?.dropEffect ?? "none",
      },
      panel,
      this.#pageDrop.windowId(),
    )
    if (Option.isSome(command)) this.#pageDrop.run(command.value)
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
    this.#panel = null
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
