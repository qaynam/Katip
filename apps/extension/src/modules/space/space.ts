import { Effect, Schema } from "effect"
import { neutralTheme, SpaceTheme } from "#modules/theme"

export const SpaceId = Schema.String.pipe(Schema.brand("SpaceId"))
export type SpaceId = typeof SpaceId.Type

export const SpaceName = Schema.Trim.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.brand("SpaceName"),
)
export type SpaceName = typeof SpaceName.Type

export const Space = Schema.Struct({
  id: SpaceId,
  name: SpaceName,
  // Spaces saved by versions before themes existed are read as having the neutral theme
  theme: SpaceTheme.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(Schema.encodeSync(SpaceTheme)(neutralTheme))),
  ),
})
export type Space = typeof Space.Type
