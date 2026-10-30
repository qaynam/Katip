import { Array, Data, Option, pipe, Record, Schema } from "effect"
import { SpaceId, SpaceName, type Space, type SpaceList } from "#modules/space"
import { BookmarkId } from "#platform/browser"

export const SpaceFolderMap = Schema.Record(SpaceId, BookmarkId)
export type SpaceFolderMap = typeof SpaceFolderMap.Type

export interface KatipRootFolder {
  readonly id: BookmarkId
  readonly title: string
}

export type SpaceFolderAction = Data.TaggedEnum<{
  /** フォルダ名が外部で変えられたので、Space 名をフォルダ名に合わせる。 */
  AdoptFolderTitle: { readonly spaceId: SpaceId; readonly name: SpaceName }
  /** フォルダ名が Space 名として使えない値にされたので、フォルダ名を Space 名に戻す。 */
  RestoreFolderTitle: { readonly folderId: BookmarkId; readonly title: SpaceName }
  /** Space のフォルダが見つからないが、同じ名前の持ち主のいないフォルダがあるので、それを Space のフォルダにする。 */
  RelinkFolder: { readonly spaceId: SpaceId; readonly folderId: BookmarkId }
  /** Space のフォルダが見つからないので、Katip 直下に作る。 */
  CreateSpaceFolder: { readonly spaceId: SpaceId; readonly title: SpaceName }
  /** どの Space のものでもないフォルダから Space を作る。`name` が None なら Space 側の既定名を使う。 */
  CreateSpaceFromFolder: {
    readonly folderId: BookmarkId
    readonly name: Option.Option<SpaceName>
  }
  /** Space 一覧に無い Space の対応を対応表から消す。 */
  ForgetSpaceFolder: { readonly spaceId: SpaceId }
}>
export const SpaceFolderAction = Data.taggedEnum<SpaceFolderAction>()

export interface SpaceFolderReconciliationInput {
  readonly spaces: SpaceList
  readonly spaceFolders: SpaceFolderMap
  /** Katip ルート直下のフォルダ。並び順が新しく作る Space の順になる。 */
  readonly rootFolders: ReadonlyArray<KatipRootFolder>
}

const decodeSpaceName = Schema.decodeUnknownOption(SpaceName)

const hasSpaceName = (folder: KatipRootFolder, name: SpaceName) =>
  Option.contains(decodeSpaceName(folder.title), name)

const titleSyncFor = (space: Space, folder: KatipRootFolder): Option.Option<SpaceFolderAction> =>
  Option.match(decodeSpaceName(folder.title), {
    onNone: () =>
      Option.some(SpaceFolderAction.RestoreFolderTitle({ folderId: folder.id, title: space.name })),
    onSome: (name) =>
      name === space.name
        ? Option.none()
        : Option.some(SpaceFolderAction.AdoptFolderTitle({ spaceId: space.id, name })),
  })

interface FolderAssignment {
  readonly actions: ReadonlyArray<SpaceFolderAction>
  readonly unclaimedFolders: ReadonlyArray<KatipRootFolder>
}

// 対応表を失ったときや、Chrome Sync がフォルダを作り直して ID が変わったときに、新しい空の
// フォルダを作ると中のピン留めを見失う。同名で持ち主のいないフォルダがあれば、そちらに結び直す
const assignFolder = (assignment: FolderAssignment, space: Space): FolderAssignment =>
  Option.match(
    Array.findFirst(assignment.unclaimedFolders, (folder) => hasSpaceName(folder, space.name)),
    {
      onNone: () => ({
        ...assignment,
        actions: [
          ...assignment.actions,
          SpaceFolderAction.CreateSpaceFolder({ spaceId: space.id, title: space.name }),
        ],
      }),
      onSome: (folder) => ({
        actions: [
          ...assignment.actions,
          SpaceFolderAction.RelinkFolder({ spaceId: space.id, folderId: folder.id }),
        ],
        unclaimedFolders: assignment.unclaimedFolders.filter(
          (unclaimed) => unclaimed.id !== folder.id,
        ),
      }),
    },
  )

/**
 * Space 一覧と Katip ルート直下のフォルダを突き合わせ、両者を一致させるための操作を返す。
 *
 * @remarks
 * 名前が食い違うときはフォルダ側を正とする（ブックマークマネージャや Chrome Sync での変更を取り込む）。
 * 対応表のフォルダが Katip 直下に無ければ、消えたものとして扱う。
 * 操作は「名前の同期 → フォルダの結び直し・作成 → 対応の破棄 → フォルダからの Space 作成」の順に並ぶ。
 */
export const planSpaceFolderReconciliation = ({
  spaces,
  spaceFolders,
  rootFolders,
}: SpaceFolderReconciliationInput): ReadonlyArray<SpaceFolderAction> => {
  const mappedFolderIdOf = (space: Space) => Record.get(spaceFolders, space.id)
  const isFirstClaimant = (space: Space, folderId: BookmarkId) =>
    pipe(
      Array.findFirst(spaces, (candidate) =>
        Option.contains(mappedFolderIdOf(candidate), folderId),
      ),
      Option.exists((claimant) => claimant.id === space.id),
    )
  const linkedFolderOf = (space: Space) =>
    pipe(
      mappedFolderIdOf(space),
      Option.flatMap((folderId) =>
        Array.findFirst(rootFolders, (folder) => folder.id === folderId),
      ),
      Option.filter((folder) => isFirstClaimant(space, folder.id)),
    )

  const links = spaces.map((space) => ({ space, folder: linkedFolderOf(space) }))
  const linkedFolderIds = new Set(Array.getSomes(links.map((link) => link.folder)).map((f) => f.id))

  const titleSyncs = Array.getSomes(
    links.map(({ space, folder }) => Option.flatMap(folder, (f) => titleSyncFor(space, f))),
  )
  const { actions: folderAssignments, unclaimedFolders } = Array.reduce(
    links.filter((link) => Option.isNone(link.folder)).map((link) => link.space),
    {
      actions: [],
      unclaimedFolders: rootFolders.filter((folder) => !linkedFolderIds.has(folder.id)),
    },
    assignFolder,
  )
  const forgottenSpaces = Record.keys(spaceFolders)
    .filter((spaceId) => !spaces.some((space) => space.id === spaceId))
    .map((spaceId) => SpaceFolderAction.ForgetSpaceFolder({ spaceId }))
  const discoveredSpaces = unclaimedFolders.map((folder) =>
    SpaceFolderAction.CreateSpaceFromFolder({
      folderId: folder.id,
      name: decodeSpaceName(folder.title),
    }),
  )

  return [...titleSyncs, ...folderAssignments, ...forgottenSpaces, ...discoveredSpaces]
}
