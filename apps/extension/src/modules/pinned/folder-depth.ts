/** The depth of the Space folder itself. Nodes directly inside the Space are at depth 1. */
export const SPACE_ROOT_DEPTH = 0

export interface FolderNestingRule {
  readonly isTabGroupSyncEnabled: boolean
}

// Tab groups can't nest, so while they are synced only the level directly inside the Space is
// projected onto them
export const maxFolderDepth = ({ isTabGroupSyncEnabled }: FolderNestingRule): number =>
  isTabGroupSyncEnabled ? 1 : 2

/**
 * Tells whether a new folder can be created inside the folder at `parentDepth`
 * ({@link SPACE_ROOT_DEPTH} for directly inside the Space).
 *
 * Folders made deeper than the limit outside Katip can still be loaded and shown, but no new
 * folder can be created inside them.
 */
export const canCreateFolderInside = (parentDepth: number, rule: FolderNestingRule): boolean =>
  parentDepth + 1 <= maxFolderDepth(rule)
