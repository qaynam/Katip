import { Schema } from "effect"

export const EXPORT_PORT_NAME = "katip/export"

export const ExportClientMessage = Schema.TaggedUnion({
  Export: {},
})
export type ExportClientMessage = typeof ExportClientMessage.Type

export const ExportServerMessage = Schema.TaggedUnion({
  // The file's text rather than a document, so the settings page saves it as received without
  // knowing the file's format
  Exported: { content: Schema.String },
  Failed: {},
})
export type ExportServerMessage = typeof ExportServerMessage.Type
