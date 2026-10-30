/** Space フォルダそのものの深さ。Space 直下のノードは深さ 1 になる。 */
export const SPACE_ROOT_DEPTH = 0

export interface FolderNestingRule {
  readonly isTabGroupSyncEnabled: boolean
}

// タブグループは入れ子にできないため、同期中は Space 直下の 1 階層だけを投影対象にする
export const maxFolderDepth = ({ isTabGroupSyncEnabled }: FolderNestingRule): number =>
  isTabGroupSyncEnabled ? 1 : 2

/**
 * 深さ `parentDepth` のフォルダ（Space 直下なら {@link SPACE_ROOT_DEPTH}）の中に、新しいフォルダを作れるかを返す。
 *
 * 外部で作られた制限より深いフォルダは読み込みも表示もできるが、その中に新しいフォルダは作れない。
 */
export const canCreateFolderInside = (parentDepth: number, rule: FolderNestingRule): boolean =>
  parentDepth + 1 <= maxFolderDepth(rule)
