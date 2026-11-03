import { Schema } from "effect"
import { SpaceId } from "#modules/space"

export const ArchiveEntryId = Schema.String.pipe(Schema.brand("ArchiveEntryId"))
export type ArchiveEntryId = typeof ArchiveEntryId.Type

export const ArchiveEntry = Schema.Struct({
  id: ArchiveEntryId,
  url: Schema.String,
  title: Schema.String,
  spaceId: SpaceId,
  archivedAt: Schema.Number,
})
export type ArchiveEntry = typeof ArchiveEntry.Type
