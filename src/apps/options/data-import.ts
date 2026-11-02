import { Clock, type Duration, Effect, Option, Result, Schema, Stream } from "effect"
import {
  arcImportOf,
  convertArcSidebar,
  type ArcConversion,
  type ArcImportChoice,
  type ArcImportReport,
} from "#modules/arc-import"
import { decodeExportFile, encodeExportFile } from "#modules/export"
import type { ImportSummary } from "#modules/import"
import { Ports } from "#platform/browser"
import { IMPORT_PORT_NAME, ImportClientMessage, ImportServerMessage } from "#protocol"

export type ImportSource = "Arc" | "Katip"

/** A file the user chose, read and previewed, to import once they confirm. */
export interface ImportCandidate {
  readonly source: ImportSource
  readonly fileName: string
  /** The file as a Katip export file, whatever it was. */
  readonly content: string
  readonly summary: ImportSummary
  /** What turning Arc's file into a Katip export file left out or changed. `None` for a Katip file. */
  readonly arcReport: Option.Option<ArcImportReport>
}

/** Arc's sidebar file, read and converted here in the page, to choose what of it to import. */
export interface ArcFile {
  readonly fileName: string
  readonly conversion: ArcConversion
}

/** What the page needs of a chosen file. A `File` from a file input is one. */
export interface ChosenFile {
  readonly name: string
  text(): Promise<string>
}

/** The browser couldn't read the chosen file. */
export class FileUnreadable extends Schema.TaggedError<FileUnreadable>()("FileUnreadable", {}) {}

/** Arc's sidebar file was chosen where a Katip export file was asked for. */
export class ArcFileChosen extends Schema.TaggedError<ArcFileChosen>()("ArcFileChosen", {}) {}

/** A Katip export file was chosen where Arc's sidebar file was asked for. */
export class KatipFileChosen extends Schema.TaggedError<KatipFileChosen>()("KatipFileChosen", {}) {}

/** The background couldn't preview or import, or its answer never arrived. */
export class ImportUnavailable extends Schema.TaggedError<ImportUnavailable>()(
  "ImportUnavailable",
  {},
) {}

const encodeClientMessage = Schema.encodeSync(ImportClientMessage)
const decodeServerMessage = Schema.decodeUnknownOption(ImportServerMessage)

const ask = (message: ImportClientMessage, timeLimit: Duration.Input) =>
  Effect.gen(function* () {
    const port = yield* (yield* Ports).connect(IMPORT_PORT_NAME)
    yield* port.post(encodeClientMessage(message))
    return yield* Effect.fromOption(
      Option.flatMap(yield* Stream.runHead(port.messages), decodeServerMessage),
    )
  }).pipe(
    Effect.scoped,
    // A request the background can't read is dropped with neither an answer nor a disconnect, so
    // without a limit this would wait forever
    Effect.timeout(timeLimit),
    Effect.catch(() => Effect.fail(new ImportUnavailable())),
  )

const previewOf = (content: string) =>
  Effect.flatMap(ask({ _tag: "Preview", content }, "30 seconds"), (answer) =>
    answer._tag === "Previewed"
      ? Effect.succeed(answer.summary)
      : Effect.fail(new ImportUnavailable()),
  )

const readText = (file: ChosenFile) =>
  Effect.tryPromise({ try: () => file.text(), catch: () => new FileUnreadable() })

/** Reads and converts Arc's sidebar file here in the page. Nothing leaves the browser. */
export const readArcFile = Effect.fnUntraced(function* (file: ChosenFile) {
  const text = yield* readText(file)
  const converted = convertArcSidebar(text, yield* Clock.currentTimeMillis)
  if (Result.isFailure(converted)) {
    return yield* Result.isSuccess(decodeExportFile(text))
      ? Effect.fail(new KatipFileChosen())
      : Effect.fail(converted.failure)
  }
  return { fileName: file.name, conversion: converted.success } satisfies ArcFile
})

/** Asks the background what importing the chosen part of Arc's file, arranged as chosen, would do. */
export const previewArcImport = Effect.fnUntraced(function* (
  file: ArcFile,
  choice: ArcImportChoice,
) {
  const { document, report } = arcImportOf(file.conversion, choice)
  const content = yield* Effect.orDie(Effect.fromResult(encodeExportFile(document)))
  return {
    source: "Arc",
    fileName: file.fileName,
    content,
    summary: yield* previewOf(content),
    arcReport: Option.some(report),
  } satisfies ImportCandidate
})

/** Reads a Katip export file here in the page and asks the background what importing it would do. */
export const prepareKatipImport = Effect.fnUntraced(function* (file: ChosenFile) {
  const text = yield* readText(file)
  const decoded = decodeExportFile(text)
  if (Result.isFailure(decoded)) {
    return yield* decoded.failure._tag === "NotKatipExport" &&
    Result.isSuccess(convertArcSidebar(text, 0))
      ? Effect.fail(new ArcFileChosen())
      : Effect.fail(decoded.failure)
  }
  return {
    source: "Katip",
    fileName: file.name,
    content: text,
    summary: yield* previewOf(text),
    arcReport: Option.none(),
  } satisfies ImportCandidate
})

/** Asks the background to import a previewed file. */
export const confirmImport = (candidate: ImportCandidate, openFavorites: boolean) =>
  Effect.flatMap(
    ask(
      {
        _tag: "Apply",
        content: candidate.content,
        openFavorites,
        spacesWithoutTheme: Option.match(candidate.arcReport, {
          onNone: () => [],
          onSome: (report) => report.spacesWithoutTheme,
        }),
        spacesNamedByImport: Option.match(candidate.arcReport, {
          onNone: () => [],
          onSome: (report) => report.spacesNamedByImport,
        }),
      },
      // Adding hundreds of pins takes a while; the limit is only for an answer that never comes
      "5 minutes",
    ),
    (answer) => (answer._tag === "Applied" ? Effect.void : Effect.fail(new ImportUnavailable())),
  )
