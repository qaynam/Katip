export interface Toast {
  readonly id: number
  readonly message: string
  readonly tone: "info" | "error"
}

const MAX_VISIBLE = 3

export class ToastQueue {
  items = $state.raw<ReadonlyArray<Toast>>([])
  #nextId = 1
  readonly #durationMs: number

  constructor(durationMs = 5_000) {
    this.#durationMs = durationMs
  }

  show(message: string, tone: Toast["tone"] = "info") {
    const id = this.#nextId++
    this.items = [...this.items, { id, message, tone }].slice(-MAX_VISIBLE)
    setTimeout(() => this.dismiss(id), this.#durationMs)
  }

  dismiss(id: number) {
    this.items = this.items.filter((toast) => toast.id !== id)
  }
}
