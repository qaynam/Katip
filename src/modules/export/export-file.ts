import { Result, Schema } from "effect"
import { ExportV1 } from "./v1"

/** 書き出しファイルの `format` に入れる、Katip の書き出しファイルであることの印。 */
export const EXPORT_FORMAT = "katip.export"

/** 書き出しが書く版の文書。読み込んだ古い版の文書も、この版に移してから返す。 */
export const LatestExport = ExportV1
export type LatestExport = ExportV1

/**
 * 書き出しが書く版。
 *
 * @remarks
 * 版は、古い Katip がファイルを読めなくなるか読み違える変更をするときだけ上げる。項目を消す・
 * 名前を変える・意味を変える・選択肢に値を足す、などがそれにあたる。省略してよい項目を足すだけなら
 * 上げない。読む側は知らない項目を読み捨てるので、古い Katip も新しい項目を飛ばして読める。
 *
 * 版を上げるときは次のようにする。
 *
 * 1. 新しい版の Schema を `v<版>.ts` に、ほかの版にも内部の Schema にも頼らずに書く。書き終えた版の
 *    ファイルは、その後変えない。
 * 2. {@link LatestExport} とこの値を新しい版にし、`buildExport` が新しい版の文書を作るようにする。
 * 3. 1 つ前の版の文書を新しい版の文書に移す純粋な関数を書く。古い版の読み方は、その版の Schema で
 *    読んでから 1 版ずつ移して最新の版にする（`latestFromV1 = (v1) => latestFromV2(v1ToV2(v1))`）。
 *    新しい版の読み方も表に足す。
 * 4. 新しい版で書いたファイルの見本を `fixtures/` に足す。古い版の見本も消さず、最新の版の文書として
 *    読めることを確かめ続ける。
 */
export const LATEST_EXPORT_VERSION: LatestExport["version"] = 1

/** JSON でないか、`format` が Katip の書き出しファイルの印でない。 */
export class NotKatipExport extends Schema.TaggedError<NotKatipExport>()("NotKatipExport", {}) {}

/** この Katip より新しい Katip が書いたファイル。読むには Katip を更新してもらう。 */
export class NewerExportVersion extends Schema.TaggedError<NewerExportVersion>()(
  "NewerExportVersion",
  { version: Schema.Int, latestVersion: Schema.Int },
) {}

/** Katip の書き出しファイルの印はあるが、版が読めないか、中身がその版の形に合わない。 */
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
 * 書き出しファイルの中身を読み、最新の版の文書にして返す。
 *
 * @remarks
 * まず `format` と `version` だけを読む。印が無ければ {@link NotKatipExport}、この Katip が知る
 * 最新の版より新しければ {@link NewerExportVersion} で断る。それ以外は書かれた版の Schema で読み、
 * 1 版ずつ最新の版へ移す。知らない項目は読み捨てる。
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
 * 最新の版の文書を、書き出しファイルの中身にする。
 *
 * 文書が版の形に合わない値（範囲を外れた数など）を持てば失敗する。
 */
export const encodeExportFile = (
  document: LatestExport,
): Result.Result<string, Schema.SchemaError> => encodeLatest(document)
