import { createContext } from "svelte"
import type { Translator } from "#modules/i18n"
import type { CommandOutcome, SidebarCommand, SidebarView, SpaceView } from "#protocol"
import type { OriginAccess } from "../connection/origin-access"
import type { FaviconResolver } from "../logic/favicon"
import type { DialogController } from "./dialog-controller.svelte"
import type { DragSession } from "./drag-session.svelte"
import type { FolderIconPickerController } from "./folder-icon-picker.svelte"
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
  /** Failures are already reported in a toast. Await it only when the outcome is needed. */
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
  /**
   * The configured language. It is replaced when the language changes while the panel is open,
   * so read it on every use.
   */
  readonly translator: Translator
  readonly originAccess: OriginAccess
  readonly liveFolderDialog: LiveFolderDialogController
  readonly folderSearch: FolderSearchController
  readonly folderIconPicker: FolderIconPickerController
}

export const [getSidebarContext, setSidebarContext] = createContext<SidebarContext>()
