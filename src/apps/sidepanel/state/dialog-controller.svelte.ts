export interface ConfirmRequest {
  readonly title: string
  readonly message: string
  readonly confirmLabel: string
}

interface PendingConfirm extends ConfirmRequest {
  readonly resolve: (confirmed: boolean) => void
}

export class DialogController {
  current = $state.raw<PendingConfirm | null>(null)

  /** Opening another confirmation cancels the one on screen, resolving it with false. */
  confirm(request: ConfirmRequest): Promise<boolean> {
    this.current?.resolve(false)
    return new Promise((resolve) => {
      this.current = { ...request, resolve }
    })
  }

  settle(confirmed: boolean) {
    const pending = this.current
    this.current = null
    pending?.resolve(confirmed)
  }
}
