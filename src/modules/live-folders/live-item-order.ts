import { Array, Match, Option, Order, pipe } from "effect"
import type { LiveItem, LiveSort, LiveSource } from "./live-source"

interface ListHead {
  readonly head: LiveItem
  readonly index: number
}

const takeNewestHead = (lists: ReadonlyArray<ReadonlyArray<LiveItem>>) =>
  pipe(
    Array.getSomes(
      lists.map((list, index) =>
        Option.map(Array.head(list), (head): ListHead => ({ head, index })),
      ),
    ),
    Array.reduce(Option.none<ListHead>(), (best, candidate) =>
      Option.isSome(best) && best.value.head.updatedAt >= candidate.head.updatedAt
        ? best
        : Option.some(candidate),
    ),
    Option.map(({ head, index }) => ({
      item: head,
      rest: lists.map((list, i) => (i === index ? list.slice(1) : list)),
    })),
  )

const interleave = (lists: ReadonlyArray<ReadonlyArray<LiveItem>>): ReadonlyArray<LiveItem> =>
  Option.match(takeNewestHead(lists), {
    onNone: () => [],
    onSome: ({ item, rest }) => [item, ...interleave(rest)],
  })

/**
 * 取得元が新しい順に並べた複数の一覧を、1 つの新しい順の一覧にまとめる。
 *
 * それぞれの一覧の中の並びは崩さず、先頭どうしの更新時刻を比べて新しい方から取り出す。
 * 同じ時刻なら先に渡した一覧から取り出す。同じ ID の項目は最初の 1 つだけを残す。
 *
 * @remarks
 * 一覧の中の並びを時刻で並べ直さないのは、取得元の並びが手元の時刻より正確なことがあるため
 * （GitHub の画面の検索は更新順に並ぶが、応答には作成時刻しか載らない）。
 */
export const mergeNewestFirst = (
  lists: ReadonlyArray<ReadonlyArray<LiveItem>>,
): ReadonlyArray<LiveItem> => Array.dedupeWith(interleave(lists), (a, b) => a.id === b.id)

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })
const byText = Order.make<string>((a, b) => {
  const compared = collator.compare(a, b)
  return compared < 0 ? -1 : compared > 0 ? 1 : 0
})

const groupNameOf = (source: LiveSource) => (item: LiveItem) =>
  Match.valueTags(source, {
    // GitHub の補足は <owner>/<repo>#<番号> の形
    GitHub: () => item.subtitle.replace(/#\d+$/, ""),
    Gmail: () => item.subtitle,
  })

/**
 * ライブフォルダの項目を、指定の並べ方で並べ直す。
 *
 * `items` は取得元が新しい順に並べた順で渡すこと。新しい順はその並びのまま、古い順はその逆にする。
 * 件名順と取得元順（GitHub はリポジトリ、Gmail は差出人ごとにまとめる）で並びが同じになる項目は、
 * 新しい順に並べる。文字の比較は大文字と小文字を区別せず、数字は数の大きさで比べる。
 */
export const sortLiveItems = (
  items: ReadonlyArray<LiveItem>,
  sort: LiveSort,
  source: LiveSource,
): ReadonlyArray<LiveItem> =>
  Match.value(sort).pipe(
    Match.when("newest", () => items),
    Match.when("oldest", () => Array.reverse(items)),
    Match.when("title", () =>
      Array.sort(
        items,
        Order.mapInput(byText, (item: LiveItem) => item.title),
      ),
    ),
    Match.when("source", () => Array.sort(items, Order.mapInput(byText, groupNameOf(source)))),
    Match.exhaustive,
  )
