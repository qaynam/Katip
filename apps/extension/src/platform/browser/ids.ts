import { Schema } from "effect"

export const TabId = Schema.Int.pipe(Schema.brand("TabId"))
export type TabId = typeof TabId.Type

export const WindowId = Schema.Int.pipe(Schema.brand("WindowId"))
export type WindowId = typeof WindowId.Type

export const TabGroupId = Schema.Int.pipe(Schema.brand("TabGroupId"))
export type TabGroupId = typeof TabGroupId.Type

export const BookmarkId = Schema.String.pipe(Schema.brand("BookmarkId"))
export type BookmarkId = typeof BookmarkId.Type

export const SplitViewId = Schema.Int.pipe(Schema.brand("SplitViewId"))
export type SplitViewId = typeof SplitViewId.Type
