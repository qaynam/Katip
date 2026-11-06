import { Array, Match, Option, Schema } from "effect"
import type { LatestExport } from "#modules/export"
import type { LiveSort, LiveSource } from "#modules/live-folders"
import {
  canCreateFolderInside,
  FolderIcon,
  SPACE_ROOT_DEPTH,
  type FolderNestingRule,
} from "#modules/pinned"
import { DEFAULT_TEXTURE, type SpaceTheme } from "#modules/theme"

type FileSpace = LatestExport["spaces"][number]
type FileNode = FileSpace["pinned"][number]
type FileLink = FileSpace["tabs"][number]
type FileLiveSource = Extract<FileNode, { readonly type: "liveFolder" }>["source"]

export interface PlannedLink {
  readonly title: string
  readonly url: string
}

export interface PlannedPin extends PlannedLink {
  readonly _tag: "Pin"
}

export interface PlannedSplit {
  readonly _tag: "Split"
  readonly left: PlannedLink
  readonly right: PlannedLink
}

export interface PlannedLiveFolder {
  readonly _tag: "LiveFolder"
  readonly title: string
  readonly source: LiveSource
  readonly sort: LiveSort
}

export interface PlannedFolder {
  readonly _tag: "Folder"
  /** Blank when the file names no title. */
  readonly title: string
  readonly icon: FolderIcon | null
  readonly children: ReadonlyArray<PlannedNode>
}

export type PlannedNode = PlannedPin | PlannedSplit | PlannedLiveFolder | PlannedFolder

/** A Space from the file, fitted to the folder depth Katip allows. */
export interface PlannedSpace {
  /** The Space's ID in the file. The Space made from it gets a new one. */
  readonly fileId: string
  /** Blank when the file names no name. */
  readonly name: string
  readonly theme: SpaceTheme
  /** In display order. */
  readonly pinned: ReadonlyArray<PlannedNode>
  /** Folders nested deeper than allowed, whose contents moved into the deepest allowed folder. */
  readonly flattenedFolders: number
  /** The file's temporary tabs in this Space, which aren't imported. */
  readonly temporaryTabs: number
}

/** How many of each thing an import adds, and how many it leaves out. */
export const ImportSummary = Schema.Struct({
  spaces: Schema.Int,
  /** Pins outside split pins. */
  pins: Schema.Int,
  folders: Schema.Int,
  splits: Schema.Int,
  liveFolders: Schema.Int,
  /** Favorites to add, closed until they're opened. */
  favorites: Schema.Int,
  /** Favorites left out because Favorites already has the same page. */
  favoritesAlreadySaved: Schema.Int,
  /** Folders nested deeper than allowed, whose contents moved into the deepest allowed folder. */
  flattenedFolders: Schema.Int,
  /** Temporary tabs, left out as they're temporary by nature. */
  temporaryTabs: Schema.Int,
})
export type ImportSummary = typeof ImportSummary.Type

const decodeFolderIcon = Schema.decodeUnknownOption(FolderIcon)

const liveSourceOf = (source: FileLiveSource): LiveSource =>
  Match.value(source).pipe(
    Match.discriminatorsExhaustive("kind")({
      gmail: ({ accountIndex, label }): LiveSource => ({ _tag: "Gmail", accountIndex, label }),
      github: ({ query }): LiveSource => ({ _tag: "GitHub", query }),
    }),
  )

const linkOf = ({ title, url }: FileLink): PlannedLink => ({ title, url })

interface PlannedNodes {
  readonly nodes: ReadonlyArray<PlannedNode>
  readonly flattenedFolders: number
}

const concatenated = (parts: ReadonlyArray<PlannedNodes>): PlannedNodes => ({
  nodes: parts.flatMap((part) => part.nodes),
  flattenedFolders: parts.reduce((sum, part) => sum + part.flattenedFolders, 0),
})

const planned = (node: PlannedNode): PlannedNodes => ({ nodes: [node], flattenedFolders: 0 })

/** `parentDepth` is the depth of the folder the nodes go in, {@link SPACE_ROOT_DEPTH} for a Space. */
const planNodes = (
  nodes: ReadonlyArray<FileNode>,
  parentDepth: number,
  rule: FolderNestingRule,
): PlannedNodes =>
  concatenated(
    nodes.map((node) =>
      Match.value(node).pipe(
        Match.discriminatorsExhaustive("type")({
          pin: (pin) => planned({ _tag: "Pin", ...linkOf(pin) }),
          split: ({ items: [left, right] }) =>
            planned({ _tag: "Split", left: linkOf(left), right: linkOf(right) }),
          liveFolder: (live) =>
            planned({
              _tag: "LiveFolder",
              title: live.title,
              source: liveSourceOf(live.source),
              sort: live.sort,
            }),
          folder: (folder): PlannedNodes => {
            if (!canCreateFolderInside(parentDepth, rule)) {
              const contents = planNodes(folder.children, parentDepth, rule)
              return { ...contents, flattenedFolders: contents.flattenedFolders + 1 }
            }
            const children = planNodes(folder.children, parentDepth + 1, rule)
            return {
              nodes: [
                {
                  _tag: "Folder",
                  title: folder.title,
                  icon: Option.getOrNull(decodeFolderIcon(folder.icon)),
                  children: children.nodes,
                },
              ],
              flattenedFolders: children.flattenedFolders,
            }
          },
        }),
      ),
    ),
  )

/**
 * Plans the Space to make from one Space of a Katip export document.
 *
 * @remarks
 * Folders nested deeper than `rule` allows aren't made: their contents go, in order, into the
 * deepest folder that is allowed. Unknown folder icons are dropped.
 */
export const planSpace = (space: FileSpace, rule: FolderNestingRule): PlannedSpace => {
  const pinned = planNodes(space.pinned, SPACE_ROOT_DEPTH, rule)
  return {
    fileId: space.id,
    name: space.name,
    // Files of version 1 were written before textures could be chosen
    theme: { ...space.theme, texture: DEFAULT_TEXTURE },
    pinned: pinned.nodes,
    flattenedFolders: pinned.flattenedFolders,
    temporaryTabs: space.tabs.length,
  }
}

export interface PlannedFavorites {
  /** In the file's order, each page once. */
  readonly toAdd: ReadonlyArray<PlannedLink>
  readonly alreadySaved: number
}

/**
 * Plans the Favorites to add from a Katip export document's Favorites.
 *
 * @param savedFavoriteUrls - Pages Favorites already has, which are left out.
 */
export const planFavorites = (
  favorites: ReadonlyArray<FileLink>,
  savedFavoriteUrls: ReadonlySet<string>,
): PlannedFavorites => {
  const distinct = Array.dedupeWith(favorites.map(linkOf), (a, b) => a.url === b.url)
  const toAdd = distinct.filter(({ url }) => !savedFavoriteUrls.has(url))
  return { toAdd, alreadySaved: distinct.length - toAdd.length }
}

interface NodeCounts {
  readonly pins: number
  readonly folders: number
  readonly splits: number
  readonly liveFolders: number
}

const noNodes: NodeCounts = { pins: 0, folders: 0, splits: 0, liveFolders: 0 }

const addCounts = (a: NodeCounts, b: NodeCounts): NodeCounts => ({
  pins: a.pins + b.pins,
  folders: a.folders + b.folders,
  splits: a.splits + b.splits,
  liveFolders: a.liveFolders + b.liveFolders,
})

const countNodes = (nodes: ReadonlyArray<PlannedNode>): NodeCounts =>
  nodes
    .map((node) =>
      Match.valueTags(node, {
        Pin: (): NodeCounts => ({ ...noNodes, pins: 1 }),
        Split: (): NodeCounts => ({ ...noNodes, splits: 1 }),
        LiveFolder: (): NodeCounts => ({ ...noNodes, liveFolders: 1 }),
        Folder: ({ children }) => addCounts({ ...noNodes, folders: 1 }, countNodes(children)),
      }),
    )
    .reduce(addCounts, noNodes)

export const summarize = (
  spaces: ReadonlyArray<PlannedSpace>,
  favorites: PlannedFavorites,
): ImportSummary => ({
  spaces: spaces.length,
  ...spaces.map((space) => countNodes(space.pinned)).reduce(addCounts, noNodes),
  favorites: favorites.toAdd.length,
  favoritesAlreadySaved: favorites.alreadySaved,
  flattenedFolders: spaces.reduce((sum, space) => sum + space.flattenedFolders, 0),
  temporaryTabs: spaces.reduce((sum, space) => sum + space.temporaryTabs, 0),
})

export interface ImportContext {
  readonly rule: FolderNestingRule
  /** Pages Favorites already has. */
  readonly savedFavoriteUrls: ReadonlySet<string>
}

/**
 * Plans adding a Katip export document's Spaces and Favorites.
 *
 * @remarks
 * The plan only adds: each Space in the file becomes a new Space, and nothing already there is
 * changed. The file's temporary tabs and settings aren't imported.
 */
export const planImport = (document: LatestExport, context: ImportContext) => {
  const spaces = document.spaces.map((space) => planSpace(space, context.rule))
  const favorites = planFavorites(document.favorites, context.savedFavoriteUrls)
  return { spaces, favorites, summary: summarize(spaces, favorites) }
}
