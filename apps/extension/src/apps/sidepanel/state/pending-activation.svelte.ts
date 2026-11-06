import type { TabId } from "#platform/browser"
import type { SidebarView } from "#protocol"
import { activeTabIdsIn, withActiveTab } from "../logic/active-tab"

// Views sent before the switch reached the browser still show the previous tab as active, so only
// a view showing the clicked tab ends the wait. The limit bounds how long a switch made elsewhere
// in the meantime, such as with a shortcut, stays hidden behind the click
const CONFIRMATION_LIMIT_MS = 1_000

// Not shown from the background's view alone: its round trip makes the highlight trail the click
// by a few frames
export class PendingActivation {
  #tabId = $state.raw<TabId | null>(null)
  #limit: ReturnType<typeof setTimeout> | undefined

  /** The view to show: `view`, with the clicked tab as active until a view confirms it. */
  shown(view: SidebarView): SidebarView {
    return this.#tabId === null ? view : withActiveTab(view, this.#tabId)
  }

  start(tabId: TabId) {
    this.#tabId = tabId
    clearTimeout(this.#limit)
    this.#limit = setTimeout(() => this.#end(), CONFIRMATION_LIMIT_MS)
  }

  /** Call with each view that arrives. */
  settleWith(view: SidebarView) {
    if (this.#tabId !== null && activeTabIdsIn(view).includes(this.#tabId)) this.#end()
  }

  /** Call when switching to `tabId` failed. */
  fail(tabId: TabId) {
    if (this.#tabId === tabId) this.#end()
  }

  #end() {
    this.#tabId = null
    clearTimeout(this.#limit)
  }
}
