import { Effect, Option, Schema } from "effect"
import { LocalePreference } from "#modules/i18n"
import { SpaceId } from "#modules/space"

// Struct 全体の検証だけに頼ると、1 項目が壊れただけで全項目が既定値に戻ってしまう。
// 項目ごとに既定値へ倒すことで、古い版の保存値や将来の項目追加にも耐える
const withDefault = <S extends Schema.Top>(schema: S, defaultValue: S["Type"]) => {
  const recovering = Schema.catchDecoding<S>(() => Effect.succeed(Option.some(defaultValue)))(
    schema,
  )
  return Schema.withDecodingDefaultTypeKey<typeof recovering>(Effect.succeed(defaultValue))(
    recovering,
  )
}

const withDefaultsOfAllFields = <S extends Schema.Top & Schema.ConstraintDecoder<unknown>>(
  struct: S,
) => withDefault(struct, Schema.decodeUnknownSync(struct)({}))

export const IdleMinutes = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(1)),
  Schema.brand("IdleMinutes"),
)
export type IdleMinutes = typeof IdleMinutes.Type

export const AutoArchiveSettings = withDefaultsOfAllFields(
  Schema.Struct({
    enabled: withDefault(Schema.Boolean, false),
    idleMinutes: withDefault(IdleMinutes, IdleMinutes.make(6 * 60)),
  }),
)
export type AutoArchiveSettings = typeof AutoArchiveSettings.Type

/**
 * Which keyboard shortcuts that copy the active tab's URL are turned on. Both are off by default.
 * A shortcut that is off does nothing when pressed, although Chrome keeps its key assigned.
 */
export const PageShortcutSettings = withDefaultsOfAllFields(
  // Named after the in-page shortcuts these replaced. Stored settings and version 1 export files
  // carry these names, so renaming them would turn existing choices back off
  Schema.Struct({
    copyUrl: withDefault(Schema.Boolean, false),
    copyMarkdownLink: withDefault(Schema.Boolean, false),
  }),
)
export type PageShortcutSettings = typeof PageShortcutSettings.Type

/**
 * ユーザー設定。
 *
 * decode は失敗しない。値が無い・オブジェクトでない場合は全体を、欠けた項目や壊れた項目は
 * その項目だけを既定値で補う。知らない項目は読み捨てる。
 */
export const Settings = withDefaultsOfAllFields(
  Schema.Struct({
    newTabsOnTop: withDefault(Schema.Boolean, true),
    showAllOpenTabsInCollapsedFolders: withDefault(Schema.Boolean, false),
    syncTabGroups: withDefault(Schema.Boolean, false),
    autoArchive: AutoArchiveSettings,
    // null は「指定なし」。新しいタブの行き先が決まらないときの扱いは呼び出し側が決める
    defaultSpaceId: withDefault(Schema.NullOr(SpaceId), null),
    locale: withDefault(LocalePreference, "auto"),
    pageShortcuts: PageShortcutSettings,
  }),
)
export type Settings = typeof Settings.Type

export const defaultSettings: Settings = Schema.decodeUnknownSync(Settings)({})

export type SettingsPatch = Partial<Omit<Settings, "autoArchive" | "pageShortcuts">> & {
  readonly autoArchive?: Partial<AutoArchiveSettings>
  readonly pageShortcuts?: Partial<PageShortcutSettings>
}

export const applySettingsPatch = (settings: Settings, patch: SettingsPatch): Settings => ({
  ...settings,
  ...patch,
  autoArchive: { ...settings.autoArchive, ...patch.autoArchive },
  pageShortcuts: { ...settings.pageShortcuts, ...patch.pageShortcuts },
})
