import { Array, Context, Effect, Layer, Predicate } from "effect"
import { type BookmarkFolder, type BookmarkNode, fromChromeBookmark } from "./bookmark"
import { type BrowserApiError, callChrome, requirePresent } from "./browser-api-error"
import type { BookmarkId } from "./ids"

/**
 * A string searches words and phrases, matching nodes whose title contains every word or whose
 * URL contains every word. An object's `title` and `url` match exactly.
 */
export type BookmarkSearchQuery =
  string | { readonly query?: string; readonly url?: string; readonly title?: string }

export interface BookmarkCreateOptions {
  /** Defaults to "Other bookmarks". */
  readonly parentId?: BookmarkId
  /** Defaults to the end. */
  readonly index?: number
  readonly title?: string
  /** Omitted or empty, a folder is created. */
  readonly url?: string
}

export interface BookmarkUpdateOptions {
  readonly title?: string
  /** Fails when set on a folder. */
  readonly url?: string
}

export interface BookmarkMoveOptions {
  /** Defaults to the current parent folder. */
  readonly parentId?: BookmarkId
  /**
   * The child of the destination folder to insert before, counting the moved node itself.
   * Defaults to the end. Moving a node later within its folder leaves it at one less than this.
   */
  readonly index?: number
}

export class Bookmarks extends Context.Service<
  Bookmarks,
  {
    readonly getTree: Effect.Effect<BookmarkFolder, BrowserApiError>
    getSubTree(id: BookmarkId): Effect.Effect<BookmarkNode, BrowserApiError>
    /** Does not load the children's own `children`. */
    getChildren(id: BookmarkId): Effect.Effect<ReadonlyArray<BookmarkNode>, BrowserApiError>
    get(id: BookmarkId): Effect.Effect<BookmarkNode, BrowserApiError>
    search(query: BookmarkSearchQuery): Effect.Effect<ReadonlyArray<BookmarkNode>, BrowserApiError>
    create(options: BookmarkCreateOptions): Effect.Effect<BookmarkNode, BrowserApiError>
    update(
      id: BookmarkId,
      options: BookmarkUpdateOptions,
    ): Effect.Effect<BookmarkNode, BrowserApiError>
    move(id: BookmarkId, options: BookmarkMoveOptions): Effect.Effect<BookmarkNode, BrowserApiError>
    /** Fails on a non-empty folder; `removeTree` removes a folder with its contents. */
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
