import { Schema } from "effect"
import { ImportSummary } from "#modules/import"

export const IMPORT_PORT_NAME = "katip/import"

// The file's content is sent as text in the export file's format, whatever the file was. The
// background then reads every import with the one reader that keeps up with the format's versions
export const ImportClientMessage = Schema.TaggedUnion({
  /** Asks what importing would add and leave out, without changing anything. */
  Preview: { content: Schema.String },
  Apply: {
    content: Schema.String,
    /** Whether to open the file's Favorites as pinned tabs. */
    openFavorites: Schema.Boolean,
    /**
     * IDs of the file's Spaces whose theme is only a placeholder. They get the theme Katip picks
     * for a new Space instead.
     */
    spacesWithoutTheme: Schema.Array(Schema.String),
  },
})
export type ImportClientMessage = typeof ImportClientMessage.Type

export const ImportServerMessage = Schema.TaggedUnion({
  Previewed: { summary: ImportSummary },
  Applied: {},
  /** The content isn't an export file this Katip can read. */
  Unreadable: {},
  /** Previewing or applying stopped partway. Spaces already added are kept. */
  Failed: {},
})
export type ImportServerMessage = typeof ImportServerMessage.Type
