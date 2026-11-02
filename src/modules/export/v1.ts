import { Schema } from "effect"

// Never rewritten, so that later versions of Katip keep reading files written in this version. A
// change of shape gets a new version's file instead. Not built from the internal Schemas, so that
// reworking the internals can't silently change the file's shape

const unitInterval = Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 })))

const Theme = Schema.Struct({
  mode: Schema.Literals(["auto", "light", "dark"]),
  colors: Schema.Array(
    Schema.Struct({
      hue: Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 360 }))),
      chroma: unitInterval,
    }),
  ).pipe(Schema.check(Schema.isMaxLength(3))),
  intensity: unitInterval,
  grain: unitInterval,
})

const Link = Schema.Struct({ title: Schema.String, url: Schema.String })

export const PinV1 = Schema.Struct({
  type: Schema.Literal("pin"),
  title: Schema.String,
  url: Schema.String,
})
export type PinV1 = typeof PinV1.Type

export const SplitV1 = Schema.Struct({
  type: Schema.Literal("split"),
  /** Left, then right. */
  items: Schema.Tuple([PinV1, PinV1]),
})
export type SplitV1 = typeof SplitV1.Type

const GitHubQuery = Schema.Literals([
  "review-requested",
  "authored-pull-requests",
  "assigned-issues",
  "mentioned",
])

export const LiveSourceV1 = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("gmail"),
    accountIndex: Schema.Int,
    /** null is the inbox. */
    label: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({ kind: Schema.Literal("github"), query: GitHubQuery }),
])
export type LiveSourceV1 = typeof LiveSourceV1.Type

export const LiveFolderV1 = Schema.Struct({
  type: Schema.Literal("liveFolder"),
  title: Schema.String,
  source: LiveSourceV1,
  sort: Schema.Literals(["newest", "oldest", "title", "source"]),
})
export type LiveFolderV1 = typeof LiveFolderV1.Type

export interface FolderV1 {
  readonly type: "folder"
  readonly title: string
  readonly icon: string | null
  readonly children: ReadonlyArray<PinnedNodeV1>
}

export type PinnedNodeV1 = PinV1 | FolderV1 | SplitV1 | LiveFolderV1

export const FolderV1: Schema.Codec<FolderV1> = Schema.Struct({
  type: Schema.Literal("folder"),
  title: Schema.String,
  // Not a closed list of icon names: every new icon would then need a new version. A reader treats
  // a name it doesn't know as no icon
  icon: Schema.NullOr(Schema.String),
  children: Schema.Array(Schema.suspend((): Schema.Codec<PinnedNodeV1> => PinnedNodeV1)),
})

export const PinnedNodeV1: Schema.Codec<PinnedNodeV1> = Schema.Union([
  PinV1,
  FolderV1,
  SplitV1,
  LiveFolderV1,
])

export const SpaceV1 = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  theme: Theme,
  /** In display order. */
  pinned: Schema.Array(PinnedNodeV1),
  /** The temporary tabs open at the time of export, in display order. */
  tabs: Schema.Array(Link),
})
export type SpaceV1 = typeof SpaceV1.Type

export const SettingsV1 = Schema.Struct({
  newTabsOnTop: Schema.Boolean,
  showAllOpenTabsInCollapsedFolders: Schema.Boolean,
  syncTabGroups: Schema.Boolean,
  autoArchive: Schema.Struct({
    enabled: Schema.Boolean,
    idleMinutes: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
  }),
  /** One of the `id`s in `spaces`. null means none chosen. */
  defaultSpaceId: Schema.NullOr(Schema.String),
  // Not a closed list of languages: every newly supported language would then need a new version.
  // A reader treats a language it doesn't know as automatic
  locale: Schema.String,
  pageShortcuts: Schema.Struct({ copyUrl: Schema.Boolean, copyMarkdownLink: Schema.Boolean }),
})
export type SettingsV1 = typeof SettingsV1.Type

/** An export file of version 1. */
export const ExportV1 = Schema.Struct({
  format: Schema.Literal("katip.export"),
  version: Schema.Literal(1),
  /** A UTC time in ISO 8601. */
  exportedAt: Schema.String,
  generator: Schema.Struct({ name: Schema.String, version: Schema.String }),
  /** In display order. */
  spaces: Schema.Array(SpaceV1),
  /** In the order shown in Favorites. */
  favorites: Schema.Array(Link),
  settings: SettingsV1,
})
export type ExportV1 = typeof ExportV1.Type
