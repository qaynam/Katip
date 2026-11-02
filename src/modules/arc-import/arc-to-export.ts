import { Array, type Data, Option, Result } from "effect"
import {
  EXPORT_FORMAT,
  exportedSettingsOf,
  LATEST_EXPORT_VERSION,
  type LatestExport,
} from "#modules/export"
import { defaultSettings } from "#modules/settings"
import { neutralTheme } from "#modules/theme"
import {
  ArcItemKind,
  readArcSidebar,
  type ArcItemEntry,
  type ArcSidebar,
  type ArcSpaceEntry,
  type NotArcSidebar,
} from "./arc-sidebar"
import { themeOfArcSpace } from "./arc-theme"

type ExportedSpace = LatestExport["spaces"][number]
type ExportedNode = ExportedSpace["pinned"][number]
type ExportedPin = Extract<ExportedNode, { readonly type: "pin" }>
type ExportedLink = ExportedSpace["tabs"][number]

/** What turning Arc's sidebar into a Katip export document left out or changed. */
export interface ArcImportReport {
  /** Tabs whose address isn't http or https, such as Arc's own pages and local files. */
  readonly nonWebLinks: number
  /** Split views with more than two tabs. Their first two tabs stay split; the rest follow as pins. */
  readonly widerSplits: number
  /** Items with no Katip equivalent, such as notes and easels. */
  readonly unsupportedItems: number
  /**
   * IDs of the document's Spaces whose Arc Space had no theme Katip could read. Their theme in the
   * document is only a placeholder, for Katip to pick one as it does for a new Space.
   */
  readonly spacesWithoutTheme: ReadonlyArray<string>
}

export interface ArcImport {
  /**
   * Arc's Spaces with their pinned entries, unpinned (Today) tabs and the Favorites. Only tabs
   * with a web address are kept. The settings are Katip's defaults, as Arc has none to carry over.
   */
  readonly document: LatestExport
  readonly report: ArcImportReport
}

type Tally = Omit<ArcImportReport, "spacesWithoutTheme">

const noTally: Tally = { nonWebLinks: 0, widerSplits: 0, unsupportedItems: 0 }

const addTallies = (a: Tally, b: Tally): Tally => ({
  nonWebLinks: a.nonWebLinks + b.nonWebLinks,
  widerSplits: a.widerSplits + b.widerSplits,
  unsupportedItems: a.unsupportedItems + b.unsupportedItems,
})

interface Converted<A> {
  readonly value: ReadonlyArray<A>
  readonly tally: Tally
}

const converted = <A>(value: ReadonlyArray<A>, tally: Partial<Tally> = {}): Converted<A> => ({
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
        Unsupported: () => converted<ExportedNode>([], { unsupportedItems: 1 }),
      }),
    ),
  )
}

const itemOf = (sidebar: ArcSidebar, id: Option.Option<string>) =>
  Option.flatMap(id, (present) => Option.fromNullishOr(sidebar.items.get(present)))

const noAncestors: Path = new Set()

const spaceOf = (sidebar: ArcSidebar, space: ArcSpaceEntry) => {
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
    } satisfies ExportedSpace,
    tally: addTallies(pinned.tally, today.tally),
    hasTheme: Option.isSome(theme),
  }
}

const favoritesOf = (sidebar: ArcSidebar): Converted<ExportedLink> => {
  const links = concatenated(
    sidebar.favoritesContainerIds.flatMap((id) =>
      Option.toArray(itemOf(sidebar, Option.some(id))).map((container) =>
        linksIn(sidebar, container, noAncestors),
      ),
    ),
  )
  return { ...links, value: Array.dedupeWith(links.value, (a, b) => a.url === b.url) }
}

/**
 * Turns the content of Arc's sidebar file (`StorableSidebar.json`) into a Katip export document of
 * the latest version.
 *
 * @remarks
 * Each Arc Space becomes a Space with the same name, its pinned tabs, folders and split views
 * become pins, folders and split pins in the same order, and its unpinned (Today) tabs become
 * temporary tabs. A pin is named after the title given in Arc, else the page's saved title, else
 * the address's host. Space icons are dropped, as Katip has none.
 *
 * @param convertedAt - Epoch milliseconds, written as the document's export time.
 */
export const arcSidebarToExport = (
  content: string,
  convertedAt: number,
): Result.Result<ArcImport, NotArcSidebar> =>
  Result.map(readArcSidebar(content), (sidebar): ArcImport => {
    const spaces = sidebar.spaces.map((space) => spaceOf(sidebar, space))
    const favorites = favoritesOf(sidebar)
    return {
      document: {
        format: EXPORT_FORMAT,
        version: LATEST_EXPORT_VERSION,
        exportedAt: new Date(convertedAt).toISOString(),
        generator: { name: "Arc", version: Option.getOrElse(sidebar.version, () => "") },
        spaces: spaces.map(({ space }) => space),
        favorites: favorites.value,
        settings: exportedSettingsOf(defaultSettings),
      },
      report: {
        ...[...spaces.map(({ tally }) => tally), favorites.tally].reduce(addTallies, noTally),
        spacesWithoutTheme: spaces.filter(({ hasTheme }) => !hasTheme).map(({ space }) => space.id),
      },
    }
  })
