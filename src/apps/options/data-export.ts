import { Clock, Effect, Option, Schema, Stream } from "effect"
import { exportFileName } from "#modules/export"
import { Ports } from "#platform/browser"
import { EXPORT_PORT_NAME, ExportClientMessage, ExportServerMessage } from "#protocol"
import { FileDownloads } from "./file-downloads"

/** background が書き出せなかったか、background から返事を受け取れなかった。 */
export class ExportUnavailable extends Schema.TaggedError<ExportUnavailable>()(
  "ExportUnavailable",
  {},
) {}

const exportRequest = Schema.encodeSync(ExportClientMessage)({ _tag: "Export" })
const decodeServerMessage = Schema.decodeUnknownOption(ExportServerMessage)

const requestExportFile = Effect.gen(function* () {
  const port = yield* (yield* Ports).connect(EXPORT_PORT_NAME)
  yield* port.post(exportRequest)
  const reply = Option.flatMap(yield* Stream.runHead(port.messages), decodeServerMessage)
  return Option.isSome(reply) && reply.value._tag === "Exported"
    ? reply.value.content
    : yield* new ExportUnavailable()
}).pipe(
  Effect.scoped,
  // background が求めを読めずに捨てると、返事も切断も届かず待ち続けてしまう
  Effect.timeout("30 seconds"),
  Effect.catch(() => Effect.fail(new ExportUnavailable())),
)

/** background に書き出しを頼み、届いた書き出しファイルをダウンロードさせる。 */
export const downloadExportFile = Effect.gen(function* () {
  const content = yield* requestExportFile
  const now = yield* Clock.currentTimeMillis
  yield* (yield* FileDownloads).save({
    name: exportFileName(new Date(now)),
    type: "application/json",
    content,
  })
})
