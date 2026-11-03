import { Clock, Effect, Option, Schema, Stream } from "effect"
import { exportFileName } from "#modules/export"
import { Ports } from "#platform/browser"
import { EXPORT_PORT_NAME, ExportClientMessage, ExportServerMessage } from "#protocol"
import { FileDownloads } from "./file-downloads"

/** The background couldn't export, or its answer never arrived. */
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
  // A request the background can't read is dropped with neither an answer nor a disconnect, so
  // without a timeout this would wait forever
  Effect.timeout("30 seconds"),
  Effect.catch(() => Effect.fail(new ExportUnavailable())),
)

/** Asks the background for an export and downloads the file it sends back. */
export const downloadExportFile = Effect.gen(function* () {
  const content = yield* requestExportFile
  const now = yield* Clock.currentTimeMillis
  yield* (yield* FileDownloads).save({
    name: exportFileName(new Date(now)),
    type: "application/json",
    content,
  })
})
