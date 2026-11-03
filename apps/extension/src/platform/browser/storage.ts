import { Context, Effect, Layer, Option, Predicate, Queue, Record, Schema, Stream } from "effect"
import { type BrowserApiError, callChrome } from "./browser-api-error"

export const StorageAreaName = Schema.Literals(["local", "session", "sync"])
export type StorageAreaName = typeof StorageAreaName.Type

export interface StorageChange {
  readonly key: string
  /** `None` if there was no value before the change. */
  readonly oldValue: Option.Option<unknown>
  /** `None` if the value was removed. */
  readonly newValue: Option.Option<unknown>
}

export class StorageDecodeError extends Schema.TaggedError<StorageDecodeError>()(
  "StorageDecodeError",
  { area: StorageAreaName, key: Schema.String, cause: Schema.Defect() },
) {}

export interface StorageArea {
  readonly name: StorageAreaName
  /** `None` if nothing is stored under `key`. */
  get(key: string): Effect.Effect<Option.Option<unknown>, BrowserApiError>
  /** `None` if nothing is stored; {@link StorageDecodeError} if the stored value won't decode. */
  getDecoded<A, RD>(
    key: string,
    schema: Schema.Decoder<A, RD>,
  ): Effect.Effect<Option.Option<A>, BrowserApiError | StorageDecodeError, RD>
  /** Chrome stores values as JSON, so pass a value encoded with a Schema. */
  set(key: string, value: unknown): Effect.Effect<void, BrowserApiError>
  remove(key: string): Effect.Effect<void, BrowserApiError>
  /**
   * Changes after subscribing, including writes from other pages such as the background and the
   * side panel. Writes that leave the value unchanged are not emitted.
   */
  readonly changes: Stream.Stream<StorageChange>
}

/** Derives `getDecoded` from `get`, so the live and fake areas decode alike. */
export const makeStorageArea = (primitives: Omit<StorageArea, "getDecoded">): StorageArea => ({
  ...primitives,
  getDecoded: (key, schema) =>
    Effect.flatMap(
      primitives.get(key),
      Option.match({
        onNone: () => Effect.succeedNone,
        onSome: (value) =>
          Schema.decodeUnknownEffect(schema)(value).pipe(
            Effect.map(Option.some),
            Effect.mapError(
              (cause) => new StorageDecodeError({ area: primitives.name, key, cause }),
            ),
          ),
      }),
    ),
})

const presentValue = (
  change: chrome.storage.StorageChange,
  property: "oldValue" | "newValue",
): Option.Option<unknown> =>
  Predicate.hasProperty(change, property) ? Option.some(change[property]) : Option.none()

const liveStorageArea = (name: StorageAreaName, area: chrome.storage.StorageArea): StorageArea =>
  makeStorageArea({
    name,
    get: (key) =>
      Effect.map(
        callChrome(`storage.${name}.get`, () => area.get(key)),
        (items) => Record.get(items, key),
      ),
    set: (key, value) => callChrome(`storage.${name}.set`, () => area.set({ [key]: value })),
    remove: (key) => callChrome(`storage.${name}.remove`, () => area.remove(key)),
    // Unlike BrowserEvent, registered on subscription rather than at top level: a missed change can
    // be made up by reading the stored value again at any time, whereas holding changes would grow
    // memory with every write on pages that never subscribe
    changes: Stream.callback<StorageChange>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
            for (const [key, change] of Object.entries(changes)) {
              Queue.offerUnsafe(queue, {
                key,
                oldValue: presentValue(change, "oldValue"),
                newValue: presentValue(change, "newValue"),
              })
            }
          }
          area.onChanged.addListener(listener)
          return listener
        }),
        (listener) => Effect.sync(() => area.onChanged.removeListener(listener)),
      ),
    ),
  })

export class Storage extends Context.Service<
  Storage,
  {
    readonly local: StorageArea
    /**
     * Cleared when the browser quits. By default only extension pages such as the background can
     * read it.
     */
    readonly session: StorageArea
    /**
     * Synced across the user's signed-in devices, with far lower size and write-rate limits than
     * `local`.
     */
    readonly sync: StorageArea
  }
>()("katip/platform/browser/Storage") {
  static readonly layer = Layer.sync(Storage, () =>
    Storage.of({
      local: liveStorageArea("local", chrome.storage.local),
      session: liveStorageArea("session", chrome.storage.session),
      sync: liveStorageArea("sync", chrome.storage.sync),
    }),
  )
}
