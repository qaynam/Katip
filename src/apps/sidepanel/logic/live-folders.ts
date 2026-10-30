import { originPatternOfKind, type LiveSource } from "#modules/live-folders"
import type { PinnedLiveFolderView } from "#protocol"

export type LiveSourceKind = LiveSource["_tag"]

export const GITHUB_TOKEN_PAGE_URL =
  "https://github.com/settings/tokens/new?description=Katip&scopes=repo"

/** 取得元から読むために許可が要るオリジン。マニフェストの optional_host_permissions と一致させる */
export const sourceOrigins = (kind: LiveSourceKind): ReadonlyArray<string> => [
  originPatternOfKind(kind),
]

export const unseenCount = (folder: PinnedLiveFolderView): number =>
  folder.items.filter((item) => item.isUnseen).length

const BADGE_LIMIT = 99

/** 狭い見出しに収めるため、多すぎる件数は「99+」にまとめる */
export const unseenBadgeText = (count: number): string =>
  count > BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(count)
