import { Array, type Data, Option, Result } from "effect"
import type { LatestExport } from "#modules/export"
import { neutralTheme } from "#modules/theme"
import {
  ArcItemKind,
  readArcSidebar,
  type ArcFavoritesContainer,
  type ArcItemEntry,
  type ArcProfile,
  type ArcSidebar,
  type ArcSpaceEntry,
  type NotArcSidebar,
} from "./arc-sidebar"
import { themeOfArcSpace } from "./arc-theme"

export type ExportedSpace = LatestExport["spaces"][number]
type ExportedNode = ExportedSpace["pinned"][number]
type ExportedPin = Extract<ExportedNode, { readonly type: "pin" }>
export type ExportedLink = ExportedSpace["tabs"][number]

/** What converting a part of Arc's sidebar left out or changed, by count. */
export interface ArcTally {
  /** Tabs whose address isn't http or https, such as Arc's own pages and local files. */
  readonly nonWebLinks: number
  /** Split views with more than two tabs. Their first two tabs stay split; the rest follow as pins. */
  readonly widerSplits: number
  /** Items with no Katip equivalent, such as notes and easels. */
  readonly unsupportedItems: number
}

export const noTally: ArcTally = { nonWebLinks: 0, widerSplits: 0, unsupportedItems: 0 }

export const addTallies = (a: ArcTally, b: ArcTally): ArcTally => ({
  nonWebLinks: a.nonWebLinks + b.nonWebLinks,
  widerSplits: a.widerSplits + b.widerSplits,
  unsupportedItems: a.unsupportedItems + b.unsupportedItems,
})

export interface ConvertedArcSpace {
  /**
   * The Space as it's imported on its own: its pinned entries, and its unpinned (Today) tabs as
   * temporary tabs. It keeps its ID and title in Arc, blank when untitled.
   */
  readonly space: ExportedSpace
  readonly profile: ArcProfile
  readonly tally: ArcTally
  /** When `false`, Arc's theme for the Space couldn't be read, and `space.theme` is a placeholder. */
  readonly hasTheme: boolean
}

export interface ConvertedArcFavorites {
  readonly profile: ArcProfile
  /** In Arc's order, each page once. */
  readonly links: ReadonlyArray<ExportedLink>
  readonly tally: ArcTally
}

/** Arc's sidebar, converted part by part to choose what of it to import. Only web pages are kept. */
export interface ArcConversion {
  /** In Arc's order. */
  readonly spaces: ReadonlyArray<ConvertedArcSpace>
  /** In Arc's order, one set for each profile. */
  readonly favorites: ReadonlyArray<ConvertedArcFavorites>
  /** Arc, with the version it wrote in the file. */
  readonly generator: LatestExport["generator"]
  /** An ISO 8601 date and time. */
  readonly convertedAt: string
}

interface Converted<A> {
  readonly value: ReadonlyArray<A>
  readonly tally: ArcTally
}

const converted = <A>(value: ReadonlyArray<A>, tally: Partial<ArcTally> = {}): Converted<A> => ({
  value,
  tally: { ...noTally, ...tally },
})

const concatenated = <A>(parts: ReadonlyArray<Converted<A>>): Converted<A> => ({
  value: parts.flatMap((part) => part.value),
  tally: parts.map((part) => part.tally).reduce(addTallies, noTally),
})

const isWebUrl = (url: string) =>
  URL.canParse(url) && ["http:", "https:"].includes(new URL(url).protocol)

const linkOf = (item: ArcItemEntry, tab: Data.TaggedEnum.Value<ArcItemKind, "Tab">) =>
  Option.map(Option.liftPredicate(tab.url, isWebUrl), (url): ExportedLink => ({
    title: item.title.pipe(
      Option.orElse(() => tab.savedTitle),
      Option.getOrElse(() => new URL(url).host),
    ),
    url,
  }))

const pinOf = (link: ExportedLink): ExportedPin => ({ type: "pin", ...link })

/** The IDs of `parent` and the items above it. */
type Path = ReadonlySet<string>

const pathThrough = (path: Path, parent: ArcItemEntry): Path => new Set([...path, parent.id])

// An item listed among its own descendants would send the conversion around in a loop
const childrenOf = (sidebar: ArcSidebar, parent: ArcItemEntry, path: Path) =>
  parent.childIds
    .filter((id) => !path.has(id))
    .flatMap((id) => Option.toArray(Option.fromNullishOr(sidebar.items.get(id))))

/** The web pages of the tabs within `parent`, however deep, in order. */
const linksIn = (
  sidebar: ArcSidebar,
  parent: ArcItemEntry,
  above: Path,
): Converted<ExportedLink> => {
  const path = pathThrough(above, parent)
  return concatenated(
    childrenOf(sidebar, parent, path).map((item) =>
      ArcItemKind.$match(item.kind, {
        Tab: (tab) =>
          Option.match(linkOf(item, tab), {
            onNone: () => converted<ExportedLink>([], { nonWebLinks: 1 }),
            onSome: (link) => converted([link]),
          }),
        Folder: () => linksIn(sidebar, item, path),
        SplitView: () => linksIn(sidebar, item, path),
        Container: () => converted<ExportedLink>([]),
        FavoritesContainer: () => converted<ExportedLink>([]),
        Unsupported: () => converted<ExportedLink>([], { unsupportedItems: 1 }),
      }),
    ),
  )
}

// A Katip split pin holds exactly two pages. The tabs past the second still deserve a place,
// right where the split was
const splitNodesOf = ({
  value: links,
  tally,
}: Converted<ExportedLink>): Converted<ExportedNode> => {
  const [left, right, ...rest] = links
  if (left === undefined) return { value: [], tally }
  if (right === undefined) return { value: [pinOf(left)], tally }
  return {
    value: [{ type: "split", items: [pinOf(left), pinOf(right)] }, ...rest.map(pinOf)],
    tally: rest.length > 0 ? addTallies(tally, { ...noTally, widerSplits: 1 }) : tally,
  }
}

const pinnedNodesIn = (
  sidebar: ArcSidebar,
  parent: ArcItemEntry,
  above: Path,
): Converted<ExportedNode> => {
  const path = pathThrough(above, parent)
  return concatenated(
    childrenOf(sidebar, parent, path).map((item) =>
      ArcItemKind.$match(item.kind, {
        Tab: (tab) =>
          Option.match(linkOf(item, tab), {
            onNone: () => converted<ExportedNode>([], { nonWebLinks: 1 }),
            onSome: (link) => converted<ExportedNode>([pinOf(link)]),
          }),
        Folder: (): Converted<ExportedNode> => {
          const children = pinnedNodesIn(sidebar, item, path)
          return {
            value: [
              {
                type: "folder",
                title: Option.getOrElse(item.title, () => ""),
                icon: null,
                children: children.value,
              },
            ],
            tally: children.tally,
          }
        },
        SplitView: () => splitNodesOf(linksIn(sidebar, item, path)),
        Container: () => converted<ExportedNode>([]),
        FavoritesContainer: () => converted<ExportedNode>([]),
        Unsupported: () => converted<ExportedNode>([], { unsupportedItems: 1 }),
      }),
    ),
  )
}

const itemOf = (sidebar: ArcSidebar, id: Option.Option<string>) =>
  Option.flatMap(id, (present) => Option.fromNullishOr(sidebar.items.get(present)))

const noAncestors: Path = new Set()

const spaceOf = (sidebar: ArcSidebar, space: ArcSpaceEntry): ConvertedArcSpace => {
  const pinned = Option.match(itemOf(sidebar, space.pinnedContainerId), {
    onNone: () => converted<ExportedNode>([]),
    onSome: (container) => pinnedNodesIn(sidebar, container, noAncestors),
  })
  const today = Option.match(itemOf(sidebar, space.unpinnedContainerId), {
    onNone: () => converted<ExportedLink>([]),
    onSome: (container) => linksIn(sidebar, container, noAncestors),
  })
  const theme = themeOfArcSpace(space.customInfo)
  return {
    space: {
      id: space.id,
      name: Option.getOrElse(space.title, () => ""),
      theme: Option.getOrElse(theme, () => neutralTheme),
      pinned: pinned.value,
      tabs: today.value,
    },
    profile: space.profile,
    tally: addTallies(pinned.tally, today.tally),
    hasTheme: Option.isSome(theme),
  }
}

const favoritesOf = (
  sidebar: ArcSidebar,
  container: ArcFavoritesContainer,
): ReadonlyArray<ConvertedArcFavorites> =>
  Option.toArray(itemOf(sidebar, Option.some(container.id))).map((item) => {
    const links = linksIn(sidebar, item, noAncestors)
    return {
      profile: container.profile,
      links: Array.dedupeWith(links.value, (a, b) => a.url === b.url),
      tally: links.tally,
    }
  })

/**
 * Converts the content of Arc's sidebar file (`StorableSidebar.json`) into the parts of a Katip
 * export document: each Arc Space, and each profile's Favorites.
 *
 * @remarks
 * A Space's pinned tabs, folders and split views become pins, folders and split pins in the same
 * order, and its unpinned (Today) tabs become temporary tabs. A pin is named after the title given
 * in Arc, else the page's saved title, else the address's host. Space icons are dropped, as Katip
 * has none.
 *
 * @param convertedAt - Epoch milliseconds.
 */
export const convertArcSidebar = (
  content: string,
  convertedAt: number,
): Result.Result<ArcConversion, NotArcSidebar> =>
  Result.map(readArcSidebar(content), (sidebar): ArcConversion => ({
    spaces: sidebar.spaces.map((space) => spaceOf(sidebar, space)),
    favorites: sidebar.favoritesContainers.flatMap((container) => favoritesOf(sidebar, container)),
    generator: { name: "Arc", version: Option.getOrElse(sidebar.version, () => "") },
    convertedAt: new Date(convertedAt).toISOString(),
  }))
