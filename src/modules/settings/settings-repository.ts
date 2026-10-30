import { Cause, Context, Effect, Layer, Option, Queue, Schema, Semaphore, Stream } from "effect"
import { type BrowserApiError, Storage, type StorageArea } from "#platform/browser"
import { applySettingsPatch, Settings, type SettingsPatch } from "./settings"

const SETTINGS_KEY = "katip/settings"

const decodeStored = (stored: Option.Option<unknown>): Settings =>
  Schema.decodeUnknownSync(Settings)(Option.getOrUndefined(stored))

const encodeForStorage = (settings: Settings) =>
  // 型を通った Settings は encode に失敗しない。失敗するなら不正な値を作った側の誤り
  Effect.orDie(Schema.encodeEffect(Settings)(settings))

const makeSettingsRepository = Effect.fnUntraced(function* (area: StorageArea) {
  // 読んでから書くまでの間に別の update が割り込むと、先に書いた側の変更が消える
  const writeLock = yield* Semaphore.make(1)

  const get = Effect.map(area.get(SETTINGS_KEY), decodeStored)

  const update = Effect.fn("SettingsRepository.update")(function* (patch: SettingsPatch) {
    const updated = applySettingsPatch(yield* get, patch)
    yield* area.set(SETTINGS_KEY, yield* encodeForStorage(updated))
    return updated
  }, Semaphore.withPermit(writeLock))

  const storedChanges = area.changes.pipe(
    Stream.filter((change) => change.key === SETTINGS_KEY),
    Stream.map((change) => decodeStored(change.newValue)),
  )

  // 読んでから購読すると、その間に他のページが保存した変更を取りこぼす。先に購読を始めておく
  const changes = Stream.unwrap(
    Effect.gen(function* () {
      const pending = yield* Queue.unbounded<Settings, Cause.Done>()
      yield* Effect.forkScoped(Stream.runIntoQueue(storedChanges, pending), {
        startImmediately: true,
      })
      const current = yield* get
      return Stream.concat(Stream.succeed(current), Stream.fromQueue(pending))
    }),
  )

  return SettingsRepository.of({ get, update, changes })
})

export class SettingsRepository extends Context.Service<
  SettingsRepository,
  {
    /** 保存値が無い・壊れている場合も失敗せず、その項目を既定値で補った設定を返す。 */
    readonly get: Effect.Effect<Settings, BrowserApiError>
    /** 最新の保存値に変更を重ねて保存し、保存した設定を返す。同時に呼ばれても直列に処理する。 */
    update(patch: SettingsPatch): Effect.Effect<Settings, BrowserApiError>
    /**
     * 購読した時点の設定を最初に流し、以降は保存値が変わるたびに新しい設定を流す。
     * 他のページ（background、サイドパネルなど）からの保存も流れる。
     */
    readonly changes: Stream.Stream<Settings, BrowserApiError>
  }
>()("katip/settings/SettingsRepository") {
  static readonly layer = Layer.effect(
    SettingsRepository,
    Effect.gen(function* () {
      const storage = yield* Storage
      return yield* makeSettingsRepository(storage.sync)
    }),
  )
}
