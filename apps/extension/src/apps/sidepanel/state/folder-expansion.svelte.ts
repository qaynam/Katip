import type { CommandOutcome } from "#protocol"

/**
 * Whether a folder shows as expanded. A click opens or closes it at once, without waiting for the
 * background, so that its contents start sliding as the click lands.
 */
export class FolderExpansion {
  // Views sent before the change reached the background still show the folder as it was, so only a
  // view that agrees, or the change failing, hands the state back to the view
  #wanted = $state<boolean | null>(null)
  readonly #fromView: () => boolean
  readonly #send: (isExpanded: boolean) => Promise<CommandOutcome>

  /**
   * @param fromView - Whether the background's view has the folder expanded.
   * @param send - Asks the background to expand or collapse the folder.
   */
  constructor(fromView: () => boolean, send: (isExpanded: boolean) => Promise<CommandOutcome>) {
    this.#fromView = fromView
    this.#send = send
    $effect.pre(() => {
      if (this.#wanted === fromView()) this.#wanted = null
    })
  }

  get isExpanded(): boolean {
    return this.#wanted ?? this.#fromView()
  }

  async set(isExpanded: boolean): Promise<void> {
    this.#wanted = isExpanded
    const outcome = await this.#send(isExpanded)
    if (outcome._tag === "Failed" && this.#wanted === isExpanded) this.#wanted = null
  }
}
