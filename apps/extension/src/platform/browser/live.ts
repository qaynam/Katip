import { Layer } from "effect"
import { Alarms } from "./alarms"
import { BrowserEvents, type CapturedBrowserEvents } from "./browser-events"
import { Bookmarks } from "./bookmarks"
import { Ports } from "./browser-port"
import { Storage } from "./storage"
import { TabGroups } from "./tab-groups"
import { Tabs } from "./tabs"
import { WebSearch } from "./web-search"
import { Windows } from "./windows"

/** Every service backed by the real Chrome APIs. `captured` holds events caught at top level. */
export const liveBrowserLayer = (captured: CapturedBrowserEvents) =>
  Layer.mergeAll(
    BrowserEvents.layer(captured),
    Ports.layer,
    Tabs.layer,
    TabGroups.layer,
    Windows.layer,
    Bookmarks.layer,
    Storage.layer,
    Alarms.layer,
    WebSearch.layer,
  )
