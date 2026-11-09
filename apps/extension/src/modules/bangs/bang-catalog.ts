import { Context, Effect, Layer, Option, Ref, Schema, Semaphore } from "effect"
import { Http } from "#platform/http"
import { type Bang, formatOfFlags } from "./bang"
import { type BangIndex, bangIndexOf } from "./bang-index"
// Fetched rather than imported: the service worker would otherwise parse the whole list every time
// it wakes, while most Spotlight searches have no bang in them
import bangDataUrl from "./data/bangs.json?url"

/** The bundled list of bangs couldn't be read. */
export class BangsUnavailable extends Schema.TaggedError<BangsUnavailable>()("BangsUnavailable", {
  cause: Schema.Defect(),
}) {}

const BangData = Schema.fromJsonString(
  Schema.Array(
    Schema.Tuple([
      Schema.String,
      Schema.NonEmptyArray(Schema.String),
      Schema.String,
      Schema.optionalKey(Schema.Int),
    ]),
  ),
)

export interface BangCatalogContents {
  /** In the order of the bundled list. */
  readonly bangs: ReadonlyArray<Bang>
  readonly index: BangIndex
}

export const catalogContentsOf = (bangs: ReadonlyArray<Bang>): BangCatalogContents => ({
  bangs,
  index: bangIndexOf(bangs),
})

const decodeBangData = Schema.decodeUnknownEffect(BangData)

const contentsOfData = (text: string) =>
  decodeBangData(text).pipe(
    Effect.map((entries) =>
      catalogContentsOf(
        entries.map(([name, triggers, template, flags]) => ({
          name,
          triggers,
          template,
          format: formatOfFlags(flags),
        })),
      ),
    ),
  )

export class BangCatalog extends Context.Service<
  BangCatalog,
  {
    /**
     * The bangs bundled with Katip, from Kagi's list by way of Helium's. Read on first use and kept;
     * a failed read is tried again the next time.
     */
    readonly contents: Effect.Effect<BangCatalogContents, BangsUnavailable>
  }
>()("katip/bangs/BangCatalog") {
  static readonly layer = Layer.effect(
    BangCatalog,
    Effect.gen(function* () {
      const http = yield* Http
      const kept = yield* Ref.make(Option.none<BangCatalogContents>())
      // Two searches arriving together would otherwise both read the list
      const readLock = yield* Semaphore.make(1)

      const read = http.send({ url: bangDataUrl, credentials: "omit" }).pipe(
        Effect.flatMap((response) => contentsOfData(response.body)),
        Effect.mapError((cause) => new BangsUnavailable({ cause })),
      )

      const contents = Effect.gen(function* () {
        const already = yield* Ref.get(kept)
        if (Option.isSome(already)) return already.value
        const fresh = yield* read
        yield* Ref.set(kept, Option.some(fresh))
        return fresh
      }).pipe(Semaphore.withPermit(readLock))

      return BangCatalog.of({ contents })
    }),
  )

  /** A catalog of `bangs` instead of the bundled list. */
  static readonly layerTest = (bangs: ReadonlyArray<Bang>) =>
    Layer.succeed(
      BangCatalog,
      BangCatalog.of({ contents: Effect.succeed(catalogContentsOf(bangs)) }),
    )
}
