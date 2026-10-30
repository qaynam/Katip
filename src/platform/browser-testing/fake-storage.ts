import { Effect, Option, Predicate, PubSub, Ref, Stream } from "effect"
import {
  makeStorageArea,
  Storage,
  type StorageArea,
  type StorageAreaName,
  type StorageChange,
} from "#platform/browser"
import { chromeCall, type FakeWorld } from "./fake-world"

export interface FakeStorage {
  readonly service: Storage["Service"]
  /** 変更を通知せずに値を入れる。 */
  readonly seed: (
    area: StorageAreaName,
    entries: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<void>
}

// Chrome は値を JSON にして保存する。保存したものをそのまま返すと、Option や Date を encode せずに
// 保存する誤りがテストで見つからないため、JSON の文字列で持って読むたびに組み立て直す
const toStoredText = (value: unknown): Option.Option<string> =>
  Predicate.isUndefined(value) || Predicate.isFunction(value) || Predicate.isSymbol(value)
    ? Option.none()
    : Option.some(JSON.stringify(value))

const fromStoredText = (text: string): unknown => JSON.parse(text)

const sameText = (a: Option.Option<string>, b: Option.Option<string>) =>
  Option.getOrNull(a) === Option.getOrNull(b)

const makeFakeArea = Effect.fnUntraced(function* (world: FakeWorld, name: StorageAreaName) {
  const texts = yield* Ref.make<ReadonlyMap<string, string>>(new Map())
  const changes = yield* PubSub.unbounded<StorageChange>()

  const write = Effect.fnUntraced(function* (key: string, next: Option.Option<string>) {
    const previous = Option.fromUndefinedOr((yield* Ref.get(texts)).get(key))
    if (sameText(previous, next)) return
    yield* Ref.update(
      texts,
      (current) =>
        new Map([
          ...[...current].filter(([existing]) => existing !== key),
          ...Option.toArray(Option.map(next, (text) => [key, text] as const)),
        ]),
    )
    yield* PubSub.publish(changes, {
      key,
      oldValue: Option.map(previous, fromStoredText),
      newValue: Option.map(next, fromStoredText),
    })
  })

  const area: StorageArea = makeStorageArea({
    name,
    get: (key) =>
      chromeCall(
        world,
        `storage.${name}.get`,
        Effect.map(Ref.get(texts), (current) =>
          Option.map(Option.fromUndefinedOr(current.get(key)), fromStoredText),
        ),
      ),
    set: (key, value) =>
      chromeCall(
        world,
        `storage.${name}.set`,
        Option.match(toStoredText(value), {
          onNone: () => Effect.void,
          onSome: (text) => write(key, Option.some(text)),
        }),
      ),
    remove: (key) => chromeCall(world, `storage.${name}.remove`, write(key, Option.none())),
    // BrowserEvents と違って購読前の変更を溜めない。live が購読のたびにリスナーを登録するのに合わせる
    changes: Stream.fromPubSub(changes),
  })

  const seed = (entries: Readonly<Record<string, unknown>>) =>
    Ref.update(texts, (current) => {
      const seeded = Object.entries(entries).flatMap(([key, value]) =>
        Option.toArray(Option.map(toStoredText(value), (text) => [key, text] as const)),
      )
      return new Map([...current, ...seeded])
    })

  return { area, seed }
})

export const makeFakeStorage = Effect.fnUntraced(function* (world: FakeWorld) {
  const areas = {
    local: yield* makeFakeArea(world, "local"),
    session: yield* makeFakeArea(world, "session"),
    sync: yield* makeFakeArea(world, "sync"),
  }
  return {
    service: Storage.of({
      local: areas.local.area,
      session: areas.session.area,
      sync: areas.sync.area,
    }),
    seed: (area, entries) => areas[area].seed(entries),
  } satisfies FakeStorage
})
