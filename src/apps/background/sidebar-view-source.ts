import { Effect } from "effect"
import { ArchiveRepository } from "#modules/archive"
import { LiveFolders } from "#modules/live-folders"
import { FolderExpansionStore, FolderIconStore, PinnedBookmarks } from "#modules/pinned"
import { SettingsRepository } from "#modules/settings"
import { projectSidebarView } from "#modules/sidebar-view"
import { Tabs, type WindowId } from "#platform/browser"
import { KatipState } from "./katip-state"
import { currentTranslator } from "./translation"

/** ウィンドウ 1 つ分のビューを、現在の状態とブラウザから組み立てる。 */
export const buildSidebarView = Effect.fnUntraced(function* (windowId: WindowId) {
  const state = yield* KatipState
  const settings = yield* (yield* SettingsRepository).get
  return projectSidebarView({
    windowId,
    spaces: yield* state.spaces.get,
    workspace: yield* state.workspace.get,
    windowTabs: yield* (yield* Tabs).query({ windowId }),
    pinnedTrees: yield* (yield* PinnedBookmarks).loadAllSpaceTrees,
    folderExpansion: yield* (yield* FolderExpansionStore).load,
    folderIcons: yield* (yield* FolderIconStore).load,
    liveFolders: yield* (yield* LiveFolders).snapshot,
    translator: yield* currentTranslator,
    preferences: {
      newTabsOnTop: settings.newTabsOnTop,
      showAllOpenTabsInCollapsedFolders: settings.showAllOpenTabsInCollapsedFolders,
      syncTabGroups: settings.syncTabGroups,
    },
    autoArchive: settings.autoArchive,
    archive: yield* (yield* ArchiveRepository).list,
    canSplit: (yield* Tabs).supportsSplitView,
  })
})
