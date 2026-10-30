import { Context, Effect, Layer, Option, Predicate, Queue, Record, Schema, Stream } from "effect"
import { type BrowserApiError, callChrome } from "./browser-api-error"

export const StorageAreaName = Schema.Literals(["local", "session", "sync"])
export type StorageAreaName = typeof StorageAreaName.Type

export interface StorageChange {
  readonly key: string
  /** 変更前に値が無かったなら `None`。 */
  readonly oldValue: Option.Option<unknown>
  /** 削除されたなら `None`。 */
  readonly newValue: Option.Option<unknown>
}

export class StorageDecodeError extends Schema.TaggedError<StorageDecodeError>()(
  "StorageDecodeError",
  { area: StorageAreaName, key: Schema.String, cause: Schema.Defect() },
) {}

export interface StorageArea {
  readonly name: StorageAreaName
  /** 値が保存されていなければ `None`。 */
  get(key: string): Effect.Effect<Option.Option<unknown>, BrowserApiError>
  /** 保存されていない場合は `None`、形が合わない場合は {@link StorageDecodeError}。 */
  getDecoded<A, RD>(
    key: string,
    schema: Schema.Decoder<A, RD>,
  ): Effect.Effect<Option.Option<A>, BrowserApiError | StorageDecodeError, RD>
  /** Chrome は値を JSON にして保存するので、Schema で encode した値を渡すこと。 */
  set(key: string, value: unknown): Effect.Effect<void, BrowserApiError>
  remove(key: string): Effect.Effect<void, BrowserApiError>
  /**
   * 購読を始めた後の変更。値が変わらない書き込みは流れない。
   * 別のページ（background と sidepanel など）からの書き込みも流れる。
   */
  readonly changes: Stream.Stream<StorageChange>
}

/** `get` から `getDecoded` を組み立てる。fake と live で decode の振る舞いをそろえるために使う。 */
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
    // BrowserEvent と違ってトップレベルでは登録せず、購読したときに登録する。保存値は起動後に
    // いつでも読み直せるので取りこぼしは読み直しで埋められる一方、溜め続けると購読しないページで
    // 書き込みのたびにメモリが増えていくため
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
    /** ブラウザを終了すると消える。既定では background などの拡張のページからしか読めない。 */
    readonly session: StorageArea
    /** ログインしている端末間で同期される。容量と書き込み回数の上限が local よりずっと小さい。 */
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
