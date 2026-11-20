import type { TabId } from "#platform/browser"

export interface SoundDialogRequest {
  readonly tabId: TabId
  /**
   * Whether Katip may access the tab's site. Asked for by the click that opened the panel, as
   * Chrome asks only while handling a click, so that Chrome's question is the only one.
   */
  readonly access: Promise<boolean>
}

/** Opens the panel for choosing where a tab's sound goes. */
export class SoundDialogController {
  current = $state.raw<SoundDialogRequest | null>(null)

  open(request: SoundDialogRequest) {
    this.current = request
  }

  close() {
    this.current = null
  }
}
