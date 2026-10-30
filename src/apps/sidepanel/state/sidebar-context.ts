import { createContext } from "svelte"
import type { CommandOutcome, SidebarCommand, SidebarView, SpaceView } from "#protocol"
import type { OriginAccess } from "../connection/origin-access"
import type { FaviconResolver } from "../logic/favicon"
import type { DialogController } from "./dialog-controller.svelte"
import type { DragSession } from "./drag-session.svelte"
import type { FolderSearchController } from "./folder-search.svelte"
import type { LiveFolderDialogController } from "./live-folder-dialog.svelte"
import type { MenuController } from "./menu-controller.svelte"
import type { PendingRename } from "./pending-rename.svelte"
import type { PendingSpaceSetup } from "./space-setup.svelte"
import type { ThemeDraft } from "./theme-draft.svelte"
import type { ThemePickerController } from "./theme-picker.svelte"
import type { ToastQueue } from "./toast-queue.svelte"
import type { TooltipController } from "./tooltip.svelte"

export interface SidebarContext {
  /** 失敗はトーストで知らせ済み。呼び出し側は結果を使うときだけ待てばよい */
  readonly run: (command: SidebarCommand) => Promise<CommandOutcome>
  readonly view: SidebarView
  readonly activeSpace: SpaceView
  readonly menu: MenuController
  readonly dialog: DialogController
  readonly drag: DragSession
  readonly pendingRename: PendingRename
  readonly spaceSetup: PendingSpaceSetup
  readonly themePicker: ThemePickerController
  readonly themeDraft: ThemeDraft
  readonly tooltip: TooltipController
  readonly faviconUrl: FaviconResolver
  readonly toasts: ToastQueue
  readonly originAccess: OriginAccess
  readonly liveFolderDialog: LiveFolderDialogController
  readonly folderSearch: FolderSearchController
}

export const [getSidebarContext, setSidebarContext] = createContext<SidebarContext>()
