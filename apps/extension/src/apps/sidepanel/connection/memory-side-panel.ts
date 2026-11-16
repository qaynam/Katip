import type { WindowId } from "#platform/browser"
import type { SidePanel } from "./side-panel"

/** A fake that closes nothing and records the windows it was asked to close the panel in. */
export interface MemorySidePanel extends SidePanel {
  readonly closedIn: ReadonlyArray<WindowId>
}

export const createMemorySidePanel = (): MemorySidePanel => {
  const closedIn: Array<WindowId> = []
  return {
    closedIn,
    close: (windowId) => {
      closedIn.push(windowId)
    },
  }
}
