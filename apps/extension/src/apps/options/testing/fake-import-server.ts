import { Context, Effect, Layer, Option, Ref, Result, Schema, Stream } from "effect"
import { decodeExportFile } from "#modules/export"
import { planImport } from "#modules/import"
import { BrowserEvents } from "#platform/browser"
import { IMPORT_PORT_NAME, ImportClientMessage, ImportServerMessage } from "#protocol"

/**
 * How the fake background answers an import. `Disconnect` hangs up without answering, and
 * `Silence` neither answers nor hangs up.
 */
export type ApplyAnswer = "Applied" | "Failed" | "Disconnect" | "Silence"

const decodeClientMessage = Schema.decodeUnknownOption(ImportClientMessage)
const encodeServerMessage = Schema.encodeSync(ImportServerMessage)

// Previews with the real plan, so a preview shows what the background would report for the file
const previewOf = (content: string): ImportServerMessage =>
  Result.match(decodeExportFile(content), {
    onFailure: (): ImportServerMessage => ({ _tag: "Unreadable" }),
    onSuccess: (document): ImportServerMessage => ({
      _tag: "Previewed",
      summary: planImport(document, {
        rule: { isTabGroupSyncEnabled: false },
        openFavoriteUrls: new Set(),
      }).summary,
    }),
  })

/**
 * For tests. Answers the settings page's import requests as the background would, without
 * changing anything, and records them. `FakeImportServer.layer` needs {@link BrowserEvents} of the
 * fake browser the page connects through.
 */
export class FakeImportServer extends Context.Service<
  FakeImportServer,
  {
    /** The requests received, in the order they arrived. */
    readonly requests: Effect.Effect<ReadonlyArray<ImportClientMessage>>
    /** How to answer the imports from now on. They're `Applied` at first. */
    answerImportsWith(answer: ApplyAnswer): Effect.Effect<void>
  }
>()("katip/options/testing/FakeImportServer") {
  static readonly layer = Layer.effect(
    FakeImportServer,
    Effect.gen(function* () {
      const requests = yield* Ref.make<ReadonlyArray<ImportClientMessage>>([])
      const applyAnswer = yield* Ref.make<ApplyAnswer>("Applied")
      yield* (yield* BrowserEvents).connections.pipe(
        Stream.filter((port) => port.name === IMPORT_PORT_NAME),
        Stream.runForEach((port) =>
          Effect.gen(function* () {
            const message = Option.flatMap(
              yield* Stream.runHead(port.messages),
              decodeClientMessage,
            )
            if (Option.isNone(message)) return
            yield* Ref.update(requests, (all) => [...all, message.value])
            if (message.value._tag === "Preview") {
              return yield* Effect.ignore(
                port.post(encodeServerMessage(previewOf(message.value.content))),
              )
            }
            const answer = yield* Ref.get(applyAnswer)
            if (answer === "Silence") return
            yield* answer === "Disconnect"
              ? port.disconnect
              : Effect.ignore(port.post(encodeServerMessage({ _tag: answer })))
          }),
        ),
        Effect.forkScoped,
      )
      return FakeImportServer.of({
        requests: Ref.get(requests),
        answerImportsWith: (answer) => Ref.set(applyAnswer, answer),
      })
    }),
  )
}
