import { Context, Effect, Layer, Option, Schema, Stream } from "effect"
import { BrowserApiError, makeHeldStream, TabId } from "#platform/browser"
import { PAGE_SOUND_SCRIPT_PATH, PageSoundOrder, PageSoundReport } from "#protocol"

/** A report from the page script in a tab's top frame. */
export interface PageReport {
  readonly tabId: TabId
  /** The page's address as Chrome gave it with the report. */
  readonly url: string
  readonly report: PageSoundReport
  /** Answers a `PageSoundStarted`; null tells the page to leave its sound alone. */
  readonly reply: (order: PageSoundOrder | null) => void
}

const decodeReport = Schema.decodeUnknownOption(PageSoundReport)
const encodeOrder = Schema.encodeSync(PageSoundOrder)

/**
 * Listens for reports from page scripts and holds them until the background subscribes.
 *
 * @remarks
 * Call synchronously at the service worker's top level: a page starting is what wakes it, and MV3
 * delivers that message only to listeners registered while the script is evaluated.
 */
export const capturePageReports = (
  onMessage: typeof chrome.runtime.onMessage,
): Stream.Stream<PageReport> => {
  const held = makeHeldStream<PageReport>()
  onMessage.addListener((message: unknown, sender, sendResponse) => {
    const report = decodeReport(message)
    const tabId = sender.tab?.id
    // Not from frames: Katip sends a site's own pages to an output, not players other sites embed
    if (Option.isNone(report) || tabId === undefined || sender.frameId !== 0) return undefined
    held.push({
      tabId: TabId.make(tabId),
      url: sender.url ?? sender.tab?.url ?? "",
      report: report.value,
      reply: (order) => sendResponse(order === null ? null : encodeOrder(order)),
    })
    // Kept open for a page that asks where its sound goes, until the background has looked it up
    return report.value._tag === "PageSoundStarted" ? true : undefined
  })
  return held.stream
}

const REGISTRATION_ID = "katip-page-sound"

const callChrome = <A>(api: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new BrowserApiError({ api, cause }) })

const register = (originPatterns: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const registered = yield* callChrome("scripting.getRegisteredContentScripts", () =>
      chrome.scripting.getRegisteredContentScripts({ ids: [REGISTRATION_ID] }),
    )
    if (originPatterns.length === 0) {
      if (registered.length > 0) {
        yield* callChrome("scripting.unregisterContentScripts", () =>
          chrome.scripting.unregisterContentScripts({ ids: [REGISTRATION_ID] }),
        )
      }
      return
    }
    const script = {
      id: REGISTRATION_ID,
      matches: [...originPatterns],
      js: [PAGE_SOUND_SCRIPT_PATH],
      // Before the page's own scripts, so a video that starts by itself plays on the output from
      // its first sound
      runAt: "document_start",
      persistAcrossSessions: true,
    } satisfies chrome.scripting.RegisteredContentScript
    yield* registered.length > 0
      ? callChrome("scripting.updateContentScripts", () =>
          chrome.scripting.updateContentScripts([script]),
        )
      : callChrome("scripting.registerContentScripts", () =>
          chrome.scripting.registerContentScripts([script]),
        )
  })

/** The page scripts that send sites' sound to outputs, and what they report. */
export class PageSound extends Context.Service<
  PageSound,
  {
    readonly reports: Stream.Stream<PageReport>
    /**
     * Makes Chrome put the page script into every page loaded from now on whose address matches
     * one of `originPatterns`, and into no other page.
     */
    register(originPatterns: ReadonlyArray<string>): Effect.Effect<void, BrowserApiError>
    /**
     * Puts the page script into the page open in the tab. It asks where the sound goes as soon as
     * it starts. Fails without access to the page's site.
     */
    inject(tabId: TabId): Effect.Effect<void, BrowserApiError>
    /** Sends `order` to the page script in the tab. Fails when the page has none. */
    tell(tabId: TabId, order: PageSoundOrder): Effect.Effect<void, BrowserApiError>
  }
>()("katip/background/PageSound") {
  static readonly layer = (reports: Stream.Stream<PageReport>) =>
    Layer.succeed(
      PageSound,
      PageSound.of({
        reports,
        register,
        inject: (tabId) =>
          Effect.asVoid(
            callChrome("scripting.executeScript", () =>
              chrome.scripting.executeScript({
                target: { tabId },
                files: [PAGE_SOUND_SCRIPT_PATH],
              }),
            ),
          ),
        tell: (tabId, order) =>
          Effect.asVoid(
            callChrome("tabs.sendMessage", () =>
              chrome.tabs.sendMessage(tabId, encodeOrder(order)),
            ),
          ),
      }),
    )
}
