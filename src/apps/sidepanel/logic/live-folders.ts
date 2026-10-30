import { Match } from "effect"
import type { LiveSource } from "#modules/live-folders"
import type { PinnedLiveFolderView, PinnedNodeView, SidebarView } from "#protocol"

export type LiveSourceKind = LiveSource["_tag"]

export const GITHUB_TOKEN_PAGE_URL =
  "https://github.com/settings/tokens/new?description=Katip&scopes=repo"

/** 取得元から読むために許可が要るオリジン。マニフェストの optional_host_permissions と一致させる */
export const sourceOrigins = (kind: LiveSourceKind): ReadonlyArray<string> =>
  Match.value(kind).pipe(
    Match.when("Gmail", () => ["https://mail.google.com/*"]),
    Match.when("GitHub", () => ["https://api.github.com/*"]),
    Match.exhaustive,
  )

export const unseenCount = (folder: PinnedLiveFolderView): number =>
  folder.items.filter((item) => item.isUnseen).length

const BADGE_LIMIT = 99

/** 狭い見出しに収めるため、多すぎる件数は「99+」にまとめる */
export const unseenBadgeText = (count: number): string =>
  count > BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(count)

const liveFoldersIn = (nodes: ReadonlyArray<PinnedNodeView>): ReadonlyArray<PinnedLiveFolderView> =>
  nodes.flatMap((node) =>
    Match.valueTags(node, {
      PinnedLiveFolder: (folder): ReadonlyArray<PinnedLiveFolderView> => [folder],
      PinnedFolder: (folder) => liveFoldersIn(folder.children),
      PinnedItem: () => [],
      PinnedSplit: () => [],
    }),
  )

// トークンはビューに載らないので、設定済みかどうかは直接は分からない。
// 取得に成功した GitHub のライブフォルダがあれば、少なくとも使えるトークンが入っている
export const hasRefreshedGitHubFolder = (view: SidebarView): boolean =>
  view.spaces
    .flatMap((space) =>
      space.pinned._tag === "Available" ? liveFoldersIn(space.pinned.nodes) : [],
    )
    .some((folder) => folder.source._tag === "GitHub" && folder.status._tag === "Ready")
