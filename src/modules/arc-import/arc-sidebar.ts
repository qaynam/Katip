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

const parseJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))
const decodeFile = Schema.decodeUnknownOption(ArcSidebarFile)
const decodeSpacesContainer = Schema.decodeUnknownOption(SpacesContainer)
const decodeSpace = Schema.decodeUnknownOption(ArcSpace)
const decodeItem = Schema.decodeUnknownOption(ArcItem)
const decodeTab = Schema.decodeUnknownOption(TabData)
const decodeList = Schema.decodeUnknownOption(ListData)
const decodeSplitView = Schema.decodeUnknownOption(SplitViewData)
const decodeContainer = Schema.decodeUnknownOption(ContainerData)

/** The file isn't JSON, or has no sidebar with Spaces. */
export class NotArcSidebar extends Schema.TaggedError<NotArcSidebar>()("NotArcSidebar", {}) {}

export interface ArcSpaceEntry {
  readonly id: string
  readonly title: Option.Option<string>
  /** The item whose children are the Space's pinned entries, in order. */
  readonly pinnedContainerId: Option.Option<string>
  /** The item whose children are the Space's unpinned (Today) entries, in order. */
  readonly unpinnedContainerId: Option.Option<string>
  /** Holds the Space's theme, among other things. */
  readonly customInfo: unknown
}

/** `Unsupported` is anything with no Katip equivalent, such as notes and easels. */
export type ArcItemKind = Data.TaggedEnum<{
  Tab: { readonly url: string; readonly savedTitle: Option.Option<string> }
  Folder: Record<never, never>
  SplitView: Record<never, never>
  /** Holds a Space's pinned or unpinned entries, or the Favorites. */
  Container: { readonly holdsFavorites: boolean }
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

export interface ArcSidebar {
  /** The version Arc wrote in the file. */
  readonly version: Option.Option<string>
  /** In the order Arc lists them. */
  readonly spaces: ReadonlyArray<ArcSpaceEntry>
  readonly items: ReadonlyMap<string, ArcItemEntry>
  /** The items whose children are the Favorites. */
  readonly favoritesContainerIds: ReadonlyArray<string>
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

const spaceEntryOf = (space: typeof ArcSpace.Type): ArcSpaceEntry => ({
  id: space.id,
  title: nonBlank(space.title),
  pinnedContainerId: containerIdOf(space, "pinned"),
  unpinnedContainerId: containerIdOf(space, "unpinned"),
  customInfo: space.customInfo,
})

const holdsFavorites = (containerType: unknown) =>
  Predicate.isObject(containerType) && Predicate.hasProperty(containerType, "topApps")

const kindOf = (data: unknown): ArcItemKind =>
  Option.firstSomeOf([
    Option.map(decodeTab(data), ({ tab }) =>
      ArcItemKind.Tab({ url: tab.savedURL ?? "", savedTitle: nonBlank(tab.savedTitle) }),
    ),
    Option.map(decodeList(data), () => ArcItemKind.Folder()),
    Option.map(decodeSplitView(data), () => ArcItemKind.SplitView()),
    Option.map(decodeContainer(data), ({ itemContainer }) =>
      ArcItemKind.Container({ holdsFavorites: holdsFavorites(itemContainer.containerType) }),
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

// Without the labels, the Favorites container is still recognizable by its type
const favoritesContainerIdsOf = (
  topAppsContainerIds: ReadonlyArray<unknown>,
  items: ReadonlyArray<ArcItemEntry>,
): ReadonlyArray<string> => {
  const listed = topAppsContainerIds.filter(Predicate.isString)
  return listed.length > 0
    ? listed
    : items
        .filter((item) => item.kind._tag === "Container" && item.kind.holdsFavorites)
        .map((item) => item.id)
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
 * skipped, so files from other versions of Arc still read.
 */
export const readArcSidebar = (content: string): Result.Result<ArcSidebar, NotArcSidebar> =>
  Result.fromOption(
    Option.flatMap(Option.flatMap(parseJson(content), decodeFile), (file) =>
      Option.map(
        Array.findFirst(file.sidebar.containers, (entry) => decodeSpacesContainer(entry)),
        (container): ArcSidebar => {
          const items = objectsIn(container.items, decodeItem).map(itemEntryOf)
          return {
            version: versionOf(file.version),
            spaces: objectsIn(container.spaces, decodeSpace).map(spaceEntryOf),
            items: new Map(items.map((item) => [item.id, item])),
            favoritesContainerIds: favoritesContainerIdsOf(
              container.topAppsContainerIDs ?? [],
              items,
            ),
          }
        },
      ),
    ),
    () => new NotArcSidebar(),
  )
