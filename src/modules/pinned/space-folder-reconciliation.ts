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
  /** The folder was renamed outside Katip, so the Space takes the folder's name. */
  AdoptFolderTitle: { readonly spaceId: SpaceId; readonly name: SpaceName }
  /**
   * The folder was renamed to something that can't be a Space name, so it gets the Space's name
   * back.
   */
  RestoreFolderTitle: { readonly folderId: BookmarkId; readonly title: SpaceName }
  /**
   * The Space's folder is missing, but an unowned folder has the same name, so that folder becomes
   * the Space's folder.
   */
  RelinkFolder: { readonly spaceId: SpaceId; readonly folderId: BookmarkId }
  /** The Space's folder is missing, so one is created directly inside the Katip root. */
  CreateSpaceFolder: { readonly spaceId: SpaceId; readonly title: SpaceName }
  /** Creates a Space from a folder no Space owns. `name` None means the Space's default name. */
  CreateSpaceFromFolder: {
    readonly folderId: BookmarkId
    readonly name: Option.Option<SpaceName>
  }
  /** Removes from the map a Space that is no longer in the Space list. */
  ForgetSpaceFolder: { readonly spaceId: SpaceId }
}>
export const SpaceFolderAction = Data.taggedEnum<SpaceFolderAction>()

export interface SpaceFolderReconciliationInput {
  readonly spaces: SpaceList
  readonly spaceFolders: SpaceFolderMap
  /** The folders directly inside the Katip root. Spaces created from them follow this order. */
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

// Not always a new empty folder: when the map is lost, or Chrome Sync recreates the folder under a
// new ID, the pins inside would be lost track of. An unowned folder with the same name is relinked
// instead
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
 * Matches the Space list against the folders directly inside the Katip root and returns the
 * actions that bring the two in line.
 *
 * @remarks
 * When names disagree, the folder wins, so renames made in the bookmark manager or through Chrome
 * Sync are taken in. A mapped folder that isn't directly inside the Katip root counts as gone.
 * The actions come in this order: name syncs, then relinked or created folders, then forgotten
 * mappings, then Spaces created from folders.
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
