import { Array, Data, Option, Predicate, Result, Schema } from "effect"

// Arc rewrites this file as it changes, so only the fields read here are checked, and every
// field is optional where Arc could leave it out. A part that still doesn't match is skipped
// rather than refusing the whole file

const ArcSidebarFile = Schema.Struct({
  version: Schema.optional(Schema.Unknown),
  sidebar: Schema.Struct({ containers: Schema.Array(Schema.Unknown) }),
})

const SpacesContainer = Schema.Struct({
  spaces: Schema.Array(Schema.Unknown),
  items: Schema.Array(Schema.Unknown),
  topAppsContainerIDs: Schema.optional(Schema.Array(Schema.Unknown)),
})

const ArcSpace = Schema.Struct({
  id: Schema.String,
  title: Schema.optional(Schema.NullOr(Schema.String)),
  containerIDs: Schema.optional(Schema.Array(Schema.Unknown)),
  newContainerIDs: Schema.optional(Schema.Array(Schema.Unknown)),
  customInfo: Schema.optional(Schema.Unknown),
  profile: Schema.optional(Schema.Unknown),
})

const ArcItem = Schema.Struct({
  id: Schema.String,
  title: Schema.optional(Schema.NullOr(Schema.String)),
  childrenIds: Schema.optional(Schema.Array(Schema.Unknown)),
  data: Schema.optional(Schema.Unknown),
})

const TabData = Schema.Struct({
  tab: Schema.Struct({
    savedURL: Schema.optional(Schema.NullOr(Schema.String)),
    savedTitle: Schema.optional(Schema.NullOr(Schema.String)),
  }),
})
const ListData = Schema.Struct({ list: Schema.Struct({}) })
const SplitViewData = Schema.Struct({ splitView: Schema.Struct({}) })
const ContainerData = Schema.Struct({
  itemContainer: Schema.Struct({ containerType: Schema.optional(Schema.Unknown) }),
})
const FavoritesContainerType = Schema.Struct({ topApps: Schema.Unknown })
const ProfileDirectory = Schema.Struct({ directoryBasename: Schema.String })

const parseJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))
const decodeFile = Schema.decodeUnknownOption(ArcSidebarFile)
const decodeSpacesContainer = Schema.decodeUnknownOption(SpacesContainer)
const decodeSpace = Schema.decodeUnknownOption(ArcSpace)
const decodeItem = Schema.decodeUnknownOption(ArcItem)
const decodeTab = Schema.decodeUnknownOption(TabData)
const decodeList = Schema.decodeUnknownOption(ListData)
const decodeSplitView = Schema.decodeUnknownOption(SplitViewData)
const decodeContainer = Schema.decodeUnknownOption(ContainerData)
const decodeFavoritesContainerType = Schema.decodeUnknownOption(FavoritesContainerType)
const decodeProfileDirectory = Schema.decodeUnknownOption(ProfileDirectory)

/** The file isn't JSON, or has no sidebar with Spaces. */
export class NotArcSidebar extends Schema.TaggedError<NotArcSidebar>()("NotArcSidebar", {}) {}

/** The Arc profile that a Space or a set of Favorites belongs to. */
export type ArcProfile = Data.TaggedEnum<{
  Default: Record<never, never>
  /** `directory` names the profile's folder among Arc's data, such as `Profile 1`. */
  Custom: { readonly directory: string }
  /** The file names no profile, or names one in a form Katip can't read. */
  Unknown: Record<never, never>
}>
export const ArcProfile = Data.taggedEnum<ArcProfile>()

export interface ArcSpaceEntry {
  readonly id: string
  readonly title: Option.Option<string>
  /** The item whose children are the Space's pinned entries, in order. */
  readonly pinnedContainerId: Option.Option<string>
  /** The item whose children are the Space's unpinned (Today) entries, in order. */
  readonly unpinnedContainerId: Option.Option<string>
  /** Holds the Space's theme, among other things. */
  readonly customInfo: unknown
  readonly profile: ArcProfile
}

/** `Unsupported` is anything with no Katip equivalent, such as notes and easels. */
export type ArcItemKind = Data.TaggedEnum<{
  Tab: { readonly url: string; readonly savedTitle: Option.Option<string> }
  Folder: Record<never, never>
  SplitView: Record<never, never>
  /** Holds a Space's pinned or unpinned entries. */
  Container: Record<never, never>
  FavoritesContainer: { readonly profile: ArcProfile }
  Unsupported: Record<never, never>
}>
export const ArcItemKind = Data.taggedEnum<ArcItemKind>()

export interface ArcItemEntry {
  readonly id: string
  /** Given by the user. Arc shows the page's title when there's none. */
  readonly title: Option.Option<string>
  readonly childIds: ReadonlyArray<string>
  readonly kind: ArcItemKind
}

/** An item whose children are one profile's Favorites. */
export interface ArcFavoritesContainer {
  readonly id: string
  readonly profile: ArcProfile
}

export interface ArcSidebar {
  /** The version Arc wrote in the file. */
  readonly version: Option.Option<string>
  /** In the order Arc lists them, each once. */
  readonly spaces: ReadonlyArray<ArcSpaceEntry>
  readonly items: ReadonlyMap<string, ArcItemEntry>
  readonly favoritesContainers: ReadonlyArray<ArcFavoritesContainer>
}

const nonBlank = (text: string | null | undefined): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(text?.trim()), (trimmed) => trimmed !== "")

const isLabel = (entry: unknown, label: string) =>
  entry === label || (Predicate.isObject(entry) && Predicate.hasProperty(entry, label))

/**
 * The container ID that follows `label`. Arc lists the containers as a label, then the ID, with
 * the label either a string (`"pinned"`) or, in newer files, an object (`{ "pinned": {} }`).
 */
const containerIdAfter = (ids: ReadonlyArray<unknown>, label: string): Option.Option<string> =>
  Option.flatMap(
    Array.findFirstIndex(ids, (entry) => isLabel(entry, label)),
    (index) => Option.liftPredicate(ids[index + 1], Predicate.isString),
  )

const containerIdOf = (space: typeof ArcSpace.Type, label: string) =>
  Option.orElse(containerIdAfter(space.newContainerIDs ?? [], label), () =>
    containerIdAfter(space.containerIDs ?? [], label),
  )

/** The value Arc wraps in `{ "_0": … }`, or `value` itself when it isn't wrapped. */
const unwrapped = (value: unknown): unknown =>
  Predicate.isObject(value) && Predicate.hasProperty(value, "_0") ? value._0 : value

// Only some files show how Arc writes another profile, so the folder's name is read with or
// without the wrapping, and as a bare string, rather than from one exact shape
const profileDirectoryIn = (custom: unknown): Option.Option<string> =>
  Option.firstSomeOf([
    Option.flatMap(Option.liftPredicate(custom, Predicate.isString), nonBlank),
    Option.flatMap(decodeProfileDirectory(custom), ({ directoryBasename }) =>
      nonBlank(directoryBasename),
    ),
    unwrapped(custom) === custom ? Option.none() : profileDirectoryIn(unwrapped(custom)),
  ])

/**
 * The profile a label names: `{ "default": {} }` (or `true`) for the default profile, and one like
 * `{ "custom": { "_0": { "directoryBasename": "Profile 1" } } }` for another.
 */
const profileOf = (label: unknown): ArcProfile => {
  if (isLabel(label, "default")) return ArcProfile.Default()
  if (!Predicate.isObject(label) || !Predicate.hasProperty(label, "custom")) {
    return ArcProfile.Unknown()
  }
  return Option.match(profileDirectoryIn(label.custom), {
    onNone: () => ArcProfile.Unknown(),
    onSome: (directory) => ArcProfile.Custom({ directory }),
  })
}

const spaceEntryOf = (space: typeof ArcSpace.Type): ArcSpaceEntry => ({
  id: space.id,
  title: nonBlank(space.title),
  pinnedContainerId: containerIdOf(space, "pinned"),
  unpinnedContainerId: containerIdOf(space, "unpinned"),
  customInfo: space.customInfo,
  profile: profileOf(space.profile),
})

const containerKindOf = (containerType: unknown): ArcItemKind =>
  Option.match(decodeFavoritesContainerType(containerType), {
    onNone: () => ArcItemKind.Container(),
    onSome: ({ topApps }) =>
      ArcItemKind.FavoritesContainer({ profile: profileOf(unwrapped(topApps)) }),
  })

const kindOf = (data: unknown): ArcItemKind =>
  Option.firstSomeOf([
    Option.map(decodeTab(data), ({ tab }) =>
      ArcItemKind.Tab({ url: tab.savedURL ?? "", savedTitle: nonBlank(tab.savedTitle) }),
    ),
    Option.map(decodeList(data), () => ArcItemKind.Folder()),
    Option.map(decodeSplitView(data), () => ArcItemKind.SplitView()),
    Option.map(decodeContainer(data), ({ itemContainer }) =>
      containerKindOf(itemContainer.containerType),
    ),
  ]).pipe(Option.getOrElse(() => ArcItemKind.Unsupported()))

const itemEntryOf = (item: typeof ArcItem.Type): ArcItemEntry => ({
  id: item.id,
  title: nonBlank(item.title),
  childIds: (item.childrenIds ?? []).filter(Predicate.isString),
  kind: kindOf(item.data),
})

// Arc lists IDs and objects alternately. Each object carries its own ID, so the IDs between them
// are skipped
const objectsIn = <A>(
  entries: ReadonlyArray<unknown>,
  decode: (entry: unknown) => Option.Option<A>,
): ReadonlyArray<A> =>
  Array.getSomes(entries.filter(Predicate.isObject).map((entry) => decode(entry)))

const ownProfileOf = (container: ArcItemEntry | undefined): ArcProfile =>
  container?.kind._tag === "FavoritesContainer" ? container.kind.profile : ArcProfile.Unknown()

/**
 * Arc lists each profile's Favorites container as the profile's label, then the container's ID.
 * The container's type names the profile too, for when the label can't be read. Without the list,
 * the containers are still recognizable by their type.
 */
const favoritesContainersOf = (
  topAppsContainerIds: ReadonlyArray<unknown>,
  items: ReadonlyMap<string, ArcItemEntry>,
): ReadonlyArray<ArcFavoritesContainer> => {
  const listed = topAppsContainerIds.flatMap((entry, index) =>
    Predicate.isString(entry) ? [{ id: entry, label: topAppsContainerIds[index - 1] }] : [],
  )
  if (listed.length === 0) {
    return [...items.values()].flatMap((item) =>
      item.kind._tag === "FavoritesContainer" ? [{ id: item.id, profile: item.kind.profile }] : [],
    )
  }
  return listed.map(({ id, label }) => {
    const labelled = profileOf(label)
    return { id, profile: labelled._tag === "Unknown" ? ownProfileOf(items.get(id)) : labelled }
  })
}

const versionOf = (version: unknown): Option.Option<string> =>
  Option.map(
    Option.liftPredicate(version, Predicate.or(Predicate.isNumber, Predicate.isString)),
    String,
  )

/**
 * Reads Arc's sidebar file (`StorableSidebar.json`).
 *
 * @remarks
 * Fields Katip doesn't use are ignored, and Spaces and items without the expected shape are
 * skipped, so files from other versions of Arc still read. A Space listed again under the same ID
 * is read once.
 */
export const readArcSidebar = (content: string): Result.Result<ArcSidebar, NotArcSidebar> =>
  Result.fromOption(
    Option.flatMap(Option.flatMap(parseJson(content), decodeFile), (file) =>
      Option.map(
        Array.findFirst(file.sidebar.containers, (entry) => decodeSpacesContainer(entry)),
        (container): ArcSidebar => {
          const items = new Map(
            objectsIn(container.items, decodeItem).map((item) => [item.id, itemEntryOf(item)]),
          )
          return {
            version: versionOf(file.version),
            spaces: Array.dedupeWith(
              objectsIn(container.spaces, decodeSpace).map(spaceEntryOf),
              (a, b) => a.id === b.id,
            ),
            items,
            favoritesContainers: favoritesContainersOf(container.topAppsContainerIDs ?? [], items),
          }
        },
      ),
    ),
    () => new NotArcSidebar(),
  )
