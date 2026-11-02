import { Array, Context, Effect, Layer, Predicate } from "effect"
import { type BookmarkFolder, type BookmarkNode, fromChromeBookmark } from "./bookmark"
import { type BrowserApiError, callChrome, requirePresent } from "./browser-api-error"
import type { BookmarkId } from "./ids"

/**
 * 文字列は語とフレーズの検索で、すべての語がタイトルか URL のどちらかに含まれるノードに一致する。
 * オブジェクトの `title`・`url` は完全一致。
 */
export type BookmarkSearchQuery =
  string | { readonly query?: string; readonly url?: string; readonly title?: string }

export interface BookmarkCreateOptions {
  /** 省略時は「その他のブックマーク」。 */
  readonly parentId?: BookmarkId
  /** 省略時は末尾。 */
  readonly index?: number
  readonly title?: string
  /** 省略するか空文字にすると、フォルダを作る。 */
  readonly url?: string
}

export interface BookmarkUpdateOptions {
  readonly title?: string
  /** フォルダに URL を設定しようとすると失敗する。 */
  readonly url?: string
}

export interface BookmarkMoveOptions {
  /** 省略時は今の親フォルダ。 */
  readonly parentId?: BookmarkId
  /**
   * 移動先フォルダの子のうち、どの子の前に入れるか（移動するノード自身も数える）。省略時は末尾。
   * 同じフォルダ内で後ろへ動かすと、移動後の位置はこの値より 1 小さくなる。
   */
  readonly index?: number
}

export class Bookmarks extends Context.Service<
  Bookmarks,
  {
    readonly getTree: Effect.Effect<BookmarkFolder, BrowserApiError>
    getSubTree(id: BookmarkId): Effect.Effect<BookmarkNode, BrowserApiError>
    /** 子ノード自身の `children` は読み込まない。 */
    getChildren(id: BookmarkId): Effect.Effect<ReadonlyArray<BookmarkNode>, BrowserApiError>
    get(id: BookmarkId): Effect.Effect<BookmarkNode, BrowserApiError>
    search(query: BookmarkSearchQuery): Effect.Effect<ReadonlyArray<BookmarkNode>, BrowserApiError>
    create(options: BookmarkCreateOptions): Effect.Effect<BookmarkNode, BrowserApiError>
    update(
      id: BookmarkId,
      options: BookmarkUpdateOptions,
    ): Effect.Effect<BookmarkNode, BrowserApiError>
    move(id: BookmarkId, options: BookmarkMoveOptions): Effect.Effect<BookmarkNode, BrowserApiError>
    /** 空でないフォルダは消せず失敗する。中身ごと消すには `removeTree` を使う。 */
    remove(id: BookmarkId): Effect.Effect<void, BrowserApiError>
    removeTree(id: BookmarkId): Effect.Effect<void, BrowserApiError>
  }
>()("katip/platform/browser/Bookmarks") {
  static readonly layer = Layer.succeed(
    Bookmarks,
    Bookmarks.of({
      getTree: Effect.flatMap(
        callChrome("bookmarks.getTree", () => chrome.bookmarks.getTree()),
        (raws) =>
          requirePresent(
            "bookmarks.getTree",
            "Chrome returned no root folder",
          )(
            Array.findFirst(
              raws.map(fromChromeBookmark),
              (node): node is BookmarkFolder => node._tag === "BookmarkFolder",
            ),
          ),
      ),
      getSubTree: Effect.fn("Bookmarks.getSubTree")(function* (id) {
        const raws = yield* callChrome("bookmarks.getSubTree", () =>
          chrome.bookmarks.getSubTree(id),
        )
        return yield* requirePresent(
          "bookmarks.getSubTree",
          "Chrome returned no node",
        )(Array.head(raws.map(fromChromeBookmark)))
      }),
      getChildren: Effect.fn("Bookmarks.getChildren")(function* (id) {
        const raws = yield* callChrome("bookmarks.getChildren", () =>
          chrome.bookmarks.getChildren(id),
        )
        return raws.map(fromChromeBookmark)
      }),
      get: Effect.fn("Bookmarks.get")(function* (id) {
        const raws = yield* callChrome("bookmarks.get", () => chrome.bookmarks.get(id))
        return yield* requirePresent(
          "bookmarks.get",
          "Chrome returned no node",
        )(Array.head(raws.map(fromChromeBookmark)))
      }),
      search: Effect.fn("Bookmarks.search")(function* (query) {
        const raws = yield* callChrome("bookmarks.search", () =>
          chrome.bookmarks.search(Predicate.isString(query) ? query : { ...query }),
        )
        return raws.map(fromChromeBookmark)
      }),
      create: Effect.fn("Bookmarks.create")(function* (options) {
        const raw = yield* callChrome("bookmarks.create", () =>
          chrome.bookmarks.create({ ...options }),
        )
        return fromChromeBookmark(raw)
      }),
      update: Effect.fn("Bookmarks.update")(function* (id, options) {
        const raw = yield* callChrome("bookmarks.update", () =>
          chrome.bookmarks.update(id, { ...options }),
        )
        return fromChromeBookmark(raw)
      }),
      move: Effect.fn("Bookmarks.move")(function* (id, options) {
        const raw = yield* callChrome("bookmarks.move", () =>
          chrome.bookmarks.move(id, { ...options }),
        )
        return fromChromeBookmark(raw)
      }),
      remove: (id) => callChrome("bookmarks.remove", () => chrome.bookmarks.remove(id)),
      removeTree: (id) => callChrome("bookmarks.removeTree", () => chrome.bookmarks.removeTree(id)),
    }),
  )
}
