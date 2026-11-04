import { Match, Option } from "effect"
import type { NotArcSidebar } from "#modules/arc-import"
import type { ExportReadError } from "#modules/export"
import type { PlainMessageKey } from "./plain-message-key"
import type {
  ArcFileChosen,
  FileUnreadable,
  ImportCandidate,
  ImportUnavailable,
  KatipFileChosen,
} from "./data-import"

/** Keys of messages that take a count and nothing else. */
type CountedMessageKey =
  | "options.data.import.preview.spaces"
  | "options.data.import.preview.pins"
  | "options.data.import.preview.folders"
  | "options.data.import.preview.splits"
  | "options.data.import.preview.liveFolders"
  | "options.data.import.preview.favorites"
  | "options.data.import.preview.flattenedFolders"
  | "options.data.import.preview.widerSplits"
  | "options.data.import.preview.temporaryTabs"
  | "options.data.import.preview.favoritesAlreadySaved"
  | "options.data.import.preview.nonWebLinks"
  | "options.data.import.preview.unsupportedItems"

export interface PreviewLine {
  readonly key: CountedMessageKey
  readonly count: number
}

export interface PreviewLines {
  readonly added: ReadonlyArray<PreviewLine>
  /** What is imported, but differently from the file, to fit Katip. */
  readonly adjusted: ReadonlyArray<PreviewLine>
  readonly leftOut: ReadonlyArray<PreviewLine>
}

const present = (lines: ReadonlyArray<PreviewLine>) => lines.filter(({ count }) => count > 0)

/** What the preview lists for a candidate, leaving out what there are none of. */
export const previewLinesOf = (
  { summary, arcReport }: ImportCandidate,
  addsFavorites: boolean,
): PreviewLines => {
  const report = Option.getOrNull(arcReport)
  return {
    added: present([
      { key: "options.data.import.preview.spaces", count: summary.spaces },
      { key: "options.data.import.preview.pins", count: summary.pins },
      { key: "options.data.import.preview.folders", count: summary.folders },
      { key: "options.data.import.preview.splits", count: summary.splits },
      { key: "options.data.import.preview.liveFolders", count: summary.liveFolders },
      {
        key: "options.data.import.preview.favorites",
        count: addsFavorites ? summary.favorites : 0,
      },
    ]),
    adjusted: present([
      { key: "options.data.import.preview.flattenedFolders", count: summary.flattenedFolders },
      { key: "options.data.import.preview.widerSplits", count: report?.widerSplits ?? 0 },
    ]),
    leftOut: present([
      { key: "options.data.import.preview.temporaryTabs", count: summary.temporaryTabs },
      {
        key: "options.data.import.preview.favoritesAlreadySaved",
        count: summary.favoritesAlreadySaved,
      },
      { key: "options.data.import.preview.nonWebLinks", count: report?.nonWebLinks ?? 0 },
      {
        key: "options.data.import.preview.unsupportedItems",
        count: report?.unsupportedItems ?? 0,
      },
    ]),
  }
}

export type PreparationError =
  | NotArcSidebar
  | KatipFileChosen
  | ArcFileChosen
  | ExportReadError
  | FileUnreadable
  | ImportUnavailable

/** The message explaining why a chosen file can't be previewed. */
export const problemMessageOf = (error: PreparationError): PlainMessageKey =>
  Match.valueTags(error, {
    NotArcSidebar: (): PlainMessageKey => "options.data.import.problem.notArc",
    KatipFileChosen: (): PlainMessageKey => "options.data.import.problem.katipFileChosen",
    NotKatipExport: (): PlainMessageKey => "options.data.import.problem.notKatip",
    ArcFileChosen: (): PlainMessageKey => "options.data.import.problem.arcFileChosen",
    NewerExportVersion: (): PlainMessageKey => "options.data.import.problem.newerVersion",
    MalformedExport: (): PlainMessageKey => "options.data.import.problem.malformed",
    FileUnreadable: (): PlainMessageKey => "options.data.import.problem.unreadable",
    ImportUnavailable: (): PlainMessageKey => "options.data.import.problem.unavailable",
  })
