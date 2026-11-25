export interface Toast {
  readonly id: number
  readonly message: string
  readonly tone: "info" | "error"
  /** When given, the message is a button that runs this and dismisses the toast. */
  readonly onActivate?: () => void
}

const MAX_VISIBLE = 3

export class ToastQueue {
  items = $state.raw<ReadonlyArray<Toast>>([])
  #nextId = 1
  readonly #durationMs: number

  constructor(durationMs = 5_000) {
    this.#durationMs = durationMs
  }

  show(message: string, tone: Toast["tone"] = "info", onActivate?: () => void) {
    const id = this.#nextId++
    const toast: Toast = { id, message, tone, ...(onActivate !== undefined && { onActivate }) }
    this.items = [...this.items, toast].slice(-MAX_VISIBLE)
    setTimeout(() => this.dismiss(id), this.#durationMs)
  }

  dismiss(id: number) {
    this.items = this.items.filter((toast) => toast.id !== id)
  }
}
