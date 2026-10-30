import { Option } from "effect"
import { TabGroupId, TabId, WindowId } from "./ids"

export const TAB_ID_NONE = -1
export const TAB_GROUP_ID_NONE = -1
export const WINDOW_ID_NONE = -1

export const nonEmptyString = (value: string | undefined): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(value), (text) => text.length > 0)

export const tabIdFrom = (raw: number | undefined): Option.Option<TabId> =>
  Option.fromNullishOr(raw).pipe(
    Option.filter((id) => id !== TAB_ID_NONE),
    Option.map((id) => TabId.make(id)),
  )

export const windowIdFrom = (raw: number | undefined): Option.Option<WindowId> =>
  Option.fromNullishOr(raw).pipe(
    Option.filter((id) => id !== WINDOW_ID_NONE),
    Option.map((id) => WindowId.make(id)),
  )

export const tabGroupIdFrom = (raw: number): Option.Option<TabGroupId> =>
  raw === TAB_GROUP_ID_NONE ? Option.none() : Option.some(TabGroupId.make(raw))

export const tabGroupIdToChrome = (groupId: Option.Option<TabGroupId>): number =>
  Option.getOrElse(groupId, () => TAB_GROUP_ID_NONE)
