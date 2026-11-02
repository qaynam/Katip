import { Clock, Effect, Option, Ref, Result, Semaphore } from "effect"
import { type BookmarkId, type BookmarkNode, Bookmarks, BrowserApiError } from "#platform/browser"
import {
  type BookmarkOutcome,
  type BookmarkTree,
  childNodes,
  createNode,
  initialBookmarkTree,
  moveNode,
  removeNode,
  rootFolder,
  searchNodes,
  shallowNode,
  subTree,
  updateNode,
} from "./bookmark-tree"
import { chromeCall, type FakeWorld } from "./fake-world"

export type BookmarkSeed =
  | { readonly title: string; readonly url: string }
  | { readonly title: string; readonly children: ReadonlyArray<BookmarkSeed> }

export interface FakeBookmarks {
  readonly service: Bookmarks["Service"]
  /** Creates nodes without firing events and returns them with their children. */
  readonly seed: <const Seeds extends ReadonlyArray<BookmarkSeed>>(
    parentId: BookmarkId,
    seeds: Seeds,
  ) => Effect.Effect<SeededBookmarks<Seeds>>
}

/** The seeded nodes with their children, in seeding order. */
export type SeededBookmarks<Seeds extends ReadonlyArray<BookmarkSeed>> = {
  readonly [K in keyof Seeds]: BookmarkNode
}

const fromResult = <A>(api: string, result: Result.Result<A, string>) =>
  Result.match(result, {
    onSuccess: (value) => Effect.succeed(value),
    onFailure: (message) => Effect.fail(new BrowserApiError({ api, cause: new Error(message) })),
  })

interface Planted {
  readonly tree: BookmarkTree
  readonly ids: ReadonlyArray<BookmarkId>
}

const plantAll = (
  tree: BookmarkTree,
  now: number,
  parentId: BookmarkId,
  seeds: ReadonlyArray<BookmarkSeed>,
): Result.Result<Planted, string> =>
  seeds.reduce(
    (planted: Result.Result<Planted, string>, seed) =>
      Result.flatMap(planted, ({ tree: current, ids }) =>
        Result.flatMap(
          createNode(current, now, {
            parentId,
            title: seed.title,
            ...("url" in seed && { url: seed.url }),
          }),
          ({ tree: grown, value: node }) =>
            Result.map(
              "children" in seed
                ? plantAll(grown, now, node.id, seed.children)
                : Result.succeed({ tree: grown, ids: [] }),
              ({ tree: withChildren }) => ({ tree: withChildren, ids: [...ids, node.id] }),
            ),
        ),
      ),
    Result.succeed({ tree, ids: [] }),
  )

export const makeFakeBookmarks = Effect.fnUntraced(function* (world: FakeWorld) {
  const tree = yield* Ref.make(initialBookmarkTree(yield* Clock.currentTimeMillis))

  const read = <A>(api: string, query: (current: BookmarkTree) => Result.Result<A, string>) =>
    chromeCall(
      world,
      api,
      Effect.flatMap(Ref.get(tree), (current) => fromResult(api, query(current))),
    )

  const write = <A>(
    api: string,
    operation: (current: BookmarkTree, now: number) => Result.Result<BookmarkOutcome<A>, string>,
  ) =>
    chromeCall(
      world,
      api,
      Semaphore.withPermits(
        world.lock,
        1,
      )(
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          const outcome = yield* fromResult(api, operation(yield* Ref.get(tree), now))
          yield* Ref.set(tree, outcome.tree)
          yield* world.publish(outcome.events)
          return outcome.value
        }),
      ),
    )

  const service = Bookmarks.of({
    getTree: read("bookmarks.getTree", rootFolder),
    getSubTree: (id) => read("bookmarks.getSubTree", (current) => subTree(current, id)),
    getChildren: (id) => read("bookmarks.getChildren", (current) => childNodes(current, id)),
    get: (id) => read("bookmarks.get", (current) => shallowNode(current, id)),
    search: (query) =>
      chromeCall(
        world,
        "bookmarks.search",
        Effect.map(Ref.get(tree), (current) => searchNodes(current, query)),
      ),
    create: (options) =>
      write("bookmarks.create", (current, now) => createNode(current, now, options)),
    update: (id, options) =>
      write("bookmarks.update", (current) => updateNode(current, id, options)),
    move: (id, options) => write("bookmarks.move", (current) => moveNode(current, id, options)),
    remove: (id) => write("bookmarks.remove", (current) => removeNode(current, id, false)),
    removeTree: (id) => write("bookmarks.removeTree", (current) => removeNode(current, id, true)),
  })

  const seed = <const Seeds extends ReadonlyArray<BookmarkSeed>>(
    parentId: BookmarkId,
    seeds: Seeds,
  ): Effect.Effect<SeededBookmarks<Seeds>> =>
    Semaphore.withPermits(
      world.lock,
      1,
    )(
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const planted = plantAll(yield* Ref.get(tree), now, parentId, seeds)
        if (Result.isFailure(planted)) {
          return yield* Effect.die(new Error(`seedBookmarks: ${planted.failure}`))
        }
        yield* Ref.set(tree, planted.success.tree)
        const nodes = planted.success.ids.flatMap((id) =>
          Option.toArray(Result.getSuccess(subTree(planted.success.tree, id))),
        )
        // Cast because flatMap drops the tuple length from the type; restore the seeds' shape
        return nodes as SeededBookmarks<Seeds>
      }),
    )

  return { service, seed } satisfies FakeBookmarks
})
