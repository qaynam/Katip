/** A panel shown in place of the Space's pins and tabs. */
export type BodyPanel = "Archive" | "Downloads"

export class BodyPanelController {
  current = $state.raw<BodyPanel | null>(null)

  show(panel: BodyPanel) {
    this.current = panel
  }

  close() {
    this.current = null
  }
}
