import type { WindowId } from "#platform/browser"

/** The browser's side panel that shows this page. Tests and the dev harness swap in a fake. */
export interface SidePanel {
  /** Closes the side panel in `windowId`. */
  readonly close: (windowId: WindowId) => void
}

// window.close() closing the panel that shows the page is how Chrome behaves rather than an API it
// documents, so it is left for Chrome before 141, which has no sidePanel.close, and for a refusal
export const chromeSidePanel: SidePanel = {
  close: (windowId) => {
    if (typeof chrome.sidePanel.close === "function") {
      void chrome.sidePanel.close({ windowId }).catch(() => window.close())
    } else {
      window.close()
    }
  },
}
