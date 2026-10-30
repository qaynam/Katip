import { Schema } from "effect"
import { BookmarkId, WindowId } from "#platform/browser"
import { SidebarCommand } from "./sidebar-command"
import { SidebarView } from "./sidebar-view"

export const SIDEBAR_PORT_NAME = "katip/sidebar"

export const RequestId = Schema.Int.pipe(Schema.brand("RequestId"))
export type RequestId = typeof RequestId.Type

export const ClientMessage = Schema.Union([
  // null は「最後にフォーカスされた通常ウィンドウ」を表す。自分のウィンドウを持たない
  // 開発用ページからも購読できるようにするため
  Schema.TaggedStruct("Subscribe", { windowId: Schema.NullOr(WindowId) }),
  Schema.TaggedStruct("Run", { requestId: RequestId, command: SidebarCommand }),
  // service worker はメッセージが途絶えると停止し、Port も切れる。開いている間は定期的に送る
  Schema.TaggedStruct("KeepAlive", {}),
])
export type ClientMessage = typeof ClientMessage.Type

export const CommandOutcome = Schema.Union([
  Schema.TaggedStruct("Succeeded", { createdBookmarkId: Schema.NullOr(BookmarkId) }),
  Schema.TaggedStruct("Failed", { reason: Schema.String }),
])
export type CommandOutcome = typeof CommandOutcome.Type

export const ServerMessage = Schema.Union([
  Schema.TaggedStruct("ViewUpdated", { view: SidebarView }),
  Schema.TaggedStruct("CommandSettled", { requestId: RequestId, outcome: CommandOutcome }),
  Schema.TaggedStruct("Notice", { message: Schema.String }),
])
export type ServerMessage = typeof ServerMessage.Type
