import { Context, Effect, Layer, Ref, Schema } from "effect"
import { BrowserApiError } from "#platform/browser"

export const OFFSCREEN_DOCUMENT_PATH = "offscreen/index.html"

export const CopyRequest = Schema.TaggedStruct("KatipCopyToClipboard", { text: Schema.String })
export type CopyRequest = typeof CopyRequest.Type

export const CopyResponse = Schema.Struct({ copied: Schema.Boolean })

const callChrome = <A>(api: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new BrowserApiError({ api, cause }) })

const decodeCopyResponse = Schema.decodeUnknownEffect(CopyResponse)

// Not copied in the service worker: it has no DOM and no focus, so neither navigator.clipboard nor
// execCommand works there. An offscreen document with no UI is opened just to do the copy
const copyViaOffscreenDocument = (text: string) =>
  Effect.gen(function* () {
    const url = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)
    const contexts = yield* callChrome("runtime.getContexts", () =>
      chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] }),
    )
    if (contexts.length === 0) {
      yield* callChrome("offscreen.createDocument", () =>
        chrome.offscreen.createDocument({
          url: OFFSCREEN_DOCUMENT_PATH,
          reasons: ["CLIPBOARD"],
          justification: "Copy the active tab's URL to the clipboard",
        }),
      )
    }
    const request: CopyRequest = { _tag: "KatipCopyToClipboard", text }
    const response = yield* callChrome("runtime.sendMessage", () =>
      chrome.runtime.sendMessage(request),
    )
    const { copied } = yield* decodeCopyResponse(response).pipe(
      Effect.mapError((cause) => new BrowserApiError({ api: "runtime.sendMessage", cause })),
    )
    if (!copied) {
      return yield* new BrowserApiError({ api: "document.execCommand", cause: "copy failed" })
    }
  })

export class Clipboard extends Context.Service<
  Clipboard,
  { writeText(text: string): Effect.Effect<void, BrowserApiError> }
>()("katip/platform/clipboard/Clipboard") {
  static readonly layer = Layer.succeed(
    Clipboard,
    Clipboard.of({ writeText: copyViaOffscreenDocument }),
  )
}

/** For tests: records every string written to the {@link Clipboard}. */
export class ClipboardRecorder extends Context.Service<
  ClipboardRecorder,
  { readonly written: Effect.Effect<ReadonlyArray<string>> }
>()("katip/platform/clipboard/ClipboardRecorder") {
  static readonly layer = Layer.effectContext(
    Effect.gen(function* () {
      const written = yield* Ref.make<ReadonlyArray<string>>([])
      return Context.make(Clipboard, {
        writeText: (text) => Ref.update(written, (all) => [...all, text]),
      }).pipe(Context.add(ClipboardRecorder, { written: Ref.get(written) }))
    }),
  )
}
