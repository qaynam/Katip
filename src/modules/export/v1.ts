import { Schema } from "effect"

// この版で書かれたファイルを後の Katip も読み続けるため、ここは書き換えない。形を変えるときは
// 新しい版のファイルを足す。内部の Schema を使わないのは、内部の作り替えでファイルの形が黙って
// 変わらないようにするため

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
  /** 左、右の順。 */
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
    /** null は受信トレイ。 */
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
  // アイコンの名前を一覧に閉じると、アイコンを足すたびに版を上げることになる。知らない名前は
  // 読む側でアイコン無しとして扱う
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
  /** 表示する順。 */
  pinned: Schema.Array(PinnedNodeV1),
  /** 書き出したときに開いていた一時タブ。表示する順。 */
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
  /** `spaces` の `id` のどれか。null は指定なし。 */
  defaultSpaceId: Schema.NullOr(Schema.String),
  // 言語を一覧に閉じると、対応する言語を足すたびに版を上げることになる。知らない言語は
  // 読む側で自動として扱う
  locale: Schema.String,
  pageShortcuts: Schema.Struct({ copyUrl: Schema.Boolean, copyMarkdownLink: Schema.Boolean }),
})
export type SettingsV1 = typeof SettingsV1.Type

/** 版 1 の書き出しファイル。 */
export const ExportV1 = Schema.Struct({
  format: Schema.Literal("katip.export"),
  version: Schema.Literal(1),
  /** ISO 8601 の UTC 時刻。 */
  exportedAt: Schema.String,
  generator: Schema.Struct({ name: Schema.String, version: Schema.String }),
  /** 並べる順。 */
  spaces: Schema.Array(SpaceV1),
  /** Favorites に並べる順。 */
  favorites: Schema.Array(Link),
  settings: SettingsV1,
})
export type ExportV1 = typeof ExportV1.Type
