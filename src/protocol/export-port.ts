import { Schema } from "effect"

export const EXPORT_PORT_NAME = "katip/export"

export const ExportClientMessage = Schema.TaggedUnion({
  Export: {},
})
export type ExportClientMessage = typeof ExportClientMessage.Type

export const ExportServerMessage = Schema.TaggedUnion({
  // 文書ではなくファイルの中身の文字列を送る。設定画面はファイルの形を知らずに、受け取ったまま
  // 保存すればよい
  Exported: { content: Schema.String },
  Failed: {},
})
export type ExportServerMessage = typeof ExportServerMessage.Type
