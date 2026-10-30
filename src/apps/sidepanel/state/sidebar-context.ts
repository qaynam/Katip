import { createContext } from "svelte"
import type { CommandOutcome, SidebarCommand, SidebarView, SpaceView } from "#protocol"
import type { FaviconResolver } from "../logic/favicon"
import type { DialogController } from "./dialog-controller.svelte"
import type { DragSession } from "./drag-session.svelte"
import type { MenuController } from "./menu-controller.svelte"
import type { PendingRename } from "./pending-rename.svelte"

export interface SidebarContext {
  /** 失敗はトーストで知らせ済み。呼び出し側は結果を使うときだけ待てばよい */
  readonly run: (command: SidebarCommand) => Promise<CommandOutcome>
  readonly view: SidebarView
  readonly activeSpace: SpaceView
  readonly menu: MenuController
  readonly dialog: DialogController
  readonly drag: DragSession
  readonly pendingRename: PendingRename
  readonly faviconUrl: FaviconResolver
}

export const [getSidebarContext, setSidebarContext] = createContext<SidebarContext>()
