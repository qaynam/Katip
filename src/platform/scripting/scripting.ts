import { Context, Effect, Layer } from "effect"
import { BrowserApiError, type TabId } from "#platform/browser"

/** ページに注入する、ファイルで用意したスクリプトの登録。 */
export interface ContentScriptRegistration {
  /** `_` で始めない。Chrome が自動で付ける ID と区別するため。 */
  readonly id: string
  /** 拡張機能のルートから見たファイルの位置。並びの順に注入する。 */
  readonly js: ReadonlyArray<string>
  readonly matches: ReadonlyArray<string>
  readonly runAt: "document_start" | "document_end" | "document_idle"
  readonly allFrames: boolean
  /** false ならブラウザを終了すると登録が消える。 */
  readonly persistAcrossSessions: boolean
}

const callChrome = <A>(api: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new BrowserApiError({ api, cause }) })

const toChrome = (script: ContentScriptRegistration): chrome.scripting.RegisteredContentScript => ({
  id: script.id,
  js: [...script.js],
  matches: [...script.matches],
  runAt: script.runAt,
  allFrames: script.allFrames,
  persistAcrossSessions: script.persistAcrossSessions,
})

const fromChrome = (
  script: chrome.scripting.RegisteredContentScript,
): ContentScriptRegistration => ({
  id: script.id,
  js: script.js ?? [],
  matches: script.matches ?? [],
  runAt: script.runAt ?? "document_idle",
  allFrames: script.allFrames ?? false,
  persistAcrossSessions: script.persistAcrossSessions ?? true,
})

export class Scripting extends Context.Service<
  Scripting,
  {
    /** 同じ ID が登録済みなら失敗する。登録し直すなら `updateContentScripts` を使う。 */
    registerContentScripts(
      scripts: ReadonlyArray<ContentScriptRegistration>,
    ): Effect.Effect<void, BrowserApiError>
    /** 登録されていない ID があれば失敗する。 */
    updateContentScripts(
      scripts: ReadonlyArray<ContentScriptRegistration>,
    ): Effect.Effect<void, BrowserApiError>
    /** 登録されていない ID があれば失敗する。注入済みのページからスクリプトを取り除きはしない。 */
    unregisterContentScripts(ids: ReadonlyArray<string>): Effect.Effect<void, BrowserApiError>
    /** `ids` のうち、登録されているもの。 */
    getRegisteredContentScripts(
      ids: ReadonlyArray<string>,
    ): Effect.Effect<ReadonlyArray<ContentScriptRegistration>, BrowserApiError>
    /**
     * 開いているタブの最上位のフレームに、ファイルのスクリプトを一度だけ注入する。
     * 許可の無いページ（`chrome://` や Chrome ウェブストアなど）では失敗する。
     */
    executeScript(tabId: TabId, files: ReadonlyArray<string>): Effect.Effect<void, BrowserApiError>
    /**
     * 開いているタブの最上位のフレームで、関数を `args` を渡して一度だけ実行する。
     *
     * @remarks
     * 関数は文字列にして送られるので、外の変数や import を参照できない。`args` は JSON にできる値に限る。
     * 許可の無いページでは失敗する（`activeTab` で一時的に許可されたタブか、ホストの許可が要る）。
     */
    executeFunction<const Args extends ReadonlyArray<unknown>>(
      tabId: TabId,
      func: (...args: Args) => void,
      args: Args,
    ): Effect.Effect<void, BrowserApiError>
  }
>()("katip/platform/scripting/Scripting") {
  static readonly layer = Layer.succeed(
    Scripting,
    Scripting.of({
      registerContentScripts: (scripts) =>
        callChrome("scripting.registerContentScripts", () =>
          chrome.scripting.registerContentScripts(scripts.map(toChrome)),
        ),
      updateContentScripts: (scripts) =>
        callChrome("scripting.updateContentScripts", () =>
          chrome.scripting.updateContentScripts(scripts.map(toChrome)),
        ),
      unregisterContentScripts: (ids) =>
        callChrome("scripting.unregisterContentScripts", () =>
          chrome.scripting.unregisterContentScripts({ ids: [...ids] }),
        ),
      getRegisteredContentScripts: (ids) =>
        Effect.map(
          callChrome("scripting.getRegisteredContentScripts", () =>
            chrome.scripting.getRegisteredContentScripts({ ids: [...ids] }),
          ),
          (scripts) => scripts.map(fromChrome),
        ),
      executeScript: (tabId, files) =>
        Effect.asVoid(
          callChrome("scripting.executeScript", () =>
            chrome.scripting.executeScript({ target: { tabId }, files: [...files] }),
          ),
        ),
      executeFunction: (tabId, func, args) =>
        Effect.asVoid(
          callChrome("scripting.executeScript", () =>
            chrome.scripting.executeScript<[...typeof args], unknown>({
              target: { tabId },
              func,
              args: [...args],
            }),
          ),
        ),
    }),
  )
}
