import { Result, Schema } from "effect"
import { ExportV1 } from "./v1"

/** The mark in an export file's `format` that says it is a Katip export file. */
export const EXPORT_FORMAT = "katip.export"

/**
 * The document of the version exports are written in. Documents read from older versions are
 * migrated to this version before they are returned.
 */
export const LatestExport = ExportV1
export type LatestExport = ExportV1

/**
 * The version exports are written in.
 *
 * @remarks
 * The version goes up only for a change that would make an older Katip fail to read a file or
 * misread it: removing a field, renaming it, changing its meaning, adding a value to a set of
 * choices, and so on. Adding a field that may be left out doesn't need a new version. Readers drop
 * fields they don't know, so an older Katip skips the new field and reads the rest.
 *
 * To raise the version:
 *
 * 1. Write the new version's Schema in `v<version>.ts`, relying on neither other versions nor the
 *    internal Schemas. A finished version's file never changes afterwards.
 * 2. Move {@link LatestExport} and this value to the new version, and make `buildExport` build
 *    documents of the new version.
 * 3. Write a pure function that migrates a document of the previous version to the new version. An
 *    old version is read with its own Schema and then migrated one version at a time up to the
 *    latest (`latestFromV1 = (v1) => latestFromV2(v1ToV2(v1))`). Add the new version's reader to
 *    the table too.
 * 4. Add a sample file written in the new version to `fixtures/`. Keep the samples of older
 *    versions, and keep checking that they read as documents of the latest version.
 */
export const LATEST_EXPORT_VERSION: LatestExport["version"] = 1

/** The content isn't JSON, or its `format` isn't the Katip export file mark. */
export class NotKatipExport extends Schema.TaggedError<NotKatipExport>()("NotKatipExport", {}) {}

/** A file written by a newer Katip than this one. Reading it takes an update of Katip. */
export class NewerExportVersion extends Schema.TaggedError<NewerExportVersion>()(
  "NewerExportVersion",
  { version: Schema.Int, latestVersion: Schema.Int },
) {}

/**
 * The file has the Katip export file mark, but its version can't be read or its content doesn't
 * fit that version's shape.
 */
export class MalformedExport extends Schema.TaggedError<MalformedExport>()("MalformedExport", {
  issue: Schema.String,
}) {}

export type ExportReadError = NotKatipExport | NewerExportVersion | MalformedExport

type ReadVersion = (document: unknown) => Result.Result<LatestExport, Schema.SchemaError>

const readAs =
  <S extends Schema.ConstraintDecoder<unknown>>(
    schema: S,
    toLatest: (document: S["Type"]) => LatestExport,
  ): ReadVersion =>
  (document) =>
    Result.map(Schema.decodeUnknownResult(schema)(document), toLatest)

const latestFromV1 = (document: ExportV1): LatestExport => document

const readVersions: ReadonlyMap<number, ReadVersion> = new Map([
  [1, readAs(ExportV1, latestFromV1)],
])

const parseJson = Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Unknown))
const decodeFormat = Schema.decodeUnknownResult(
  Schema.Struct({ format: Schema.Literal(EXPORT_FORMAT) }),
)
const decodeVersion = Schema.decodeUnknownResult(
  Schema.Struct({ version: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))) }),
)

const malformed = (error: Schema.SchemaError) => new MalformedExport({ issue: error.message })

/**
 * Reads an export file's content and returns it as a document of the latest version.
 *
 * @remarks
 * Only `format` and `version` are read first. Without the mark it fails with
 * {@link NotKatipExport}, and with a version newer than the latest this Katip knows it fails with
 * {@link NewerExportVersion}. Otherwise the content is read with the Schema of the version it was
 * written in and migrated one version at a time to the latest. Unknown fields are dropped.
 */
export const decodeExportFile = (content: string): Result.Result<LatestExport, ExportReadError> =>
  Result.gen(function* () {
    const json = yield* Result.mapError(parseJson(content), () => new NotKatipExport())
    yield* Result.mapError(decodeFormat(json), () => new NotKatipExport())
    const { version } = yield* Result.mapError(decodeVersion(json), malformed)
    const read = readVersions.get(version)
    if (read === undefined) {
      return yield* Result.fail(
        new NewerExportVersion({ version, latestVersion: LATEST_EXPORT_VERSION }),
      )
    }
    return yield* Result.mapError(read(json), malformed)
  })

const encodeLatest = Schema.encodeResult(Schema.fromJsonString(LatestExport, { space: 2 }))

/**
 * Turns a document of the latest version into an export file's content.
 *
 * Fails when the document holds a value that doesn't fit the version's shape, such as a number out
 * of range.
 */
export const encodeExportFile = (
  document: LatestExport,
): Result.Result<string, Schema.SchemaError> => encodeLatest(document)
