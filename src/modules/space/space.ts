import { Schema } from "effect"

export const SpaceId = Schema.String.pipe(Schema.brand("SpaceId"))
export type SpaceId = typeof SpaceId.Type

export const SpaceName = Schema.Trim.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.brand("SpaceName"),
)
export type SpaceName = typeof SpaceName.Type

// Chrome のタブグループと同じ色集合に揃えておくと、グループ同期で色を変換せずに済む
export const SpaceColor = Schema.Literals([
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
])
export type SpaceColor = typeof SpaceColor.Type

export const Space = Schema.Struct({
  id: SpaceId,
  name: SpaceName,
  color: SpaceColor,
})
export type Space = typeof Space.Type
