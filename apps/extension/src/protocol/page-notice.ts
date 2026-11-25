import { Schema } from "effect"
import { TabId } from "#platform/browser"

/** The port a notice Katip shows on a page connects on once it is clicked. */
export const PAGE_NOTICE_PORT_NAME = "katip/page-notice"

/** Sent to the background by a notice on a page that was clicked. */
export const PageNoticeClick = Schema.TaggedUnion({
  /** Brings `tabId` to the front, if it is in the window of the page the notice is on. */
  SwitchToTab: { tabId: TabId },
})
export type PageNoticeClick = typeof PageNoticeClick.Type
