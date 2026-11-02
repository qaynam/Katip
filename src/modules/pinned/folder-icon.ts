import { Schema } from "effect"

/**
 * フォルダの絵の代わりに見出しに出せるアイコン。並びはアイコンを選ぶ一覧の並び順。
 *
 * @remarks
 * 名前は保存値に残るので、絵柄の出どころではなく何を描いたものかで付ける。
 * 絵柄を差し替えても、保存値を読み替えずに済む。
 */
export const FolderIcon = Schema.Literals([
  "star",
  "bookmark",
  "heart",
  "bolt",
  "triangle",
  "asterisk",
  "bell",
  "lightbulb",
  "chat",
  "people",
  "wrench",
  "egg",
  "circle",
  "moon",
  "planet",
  "leaf",
  "cloud",
  "paw",
  "hammer",
  "airplane",
  "music",
  "video",
  "code",
  "skull",
])
export type FolderIcon = typeof FolderIcon.Type
