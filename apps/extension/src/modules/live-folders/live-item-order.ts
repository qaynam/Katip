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
 * Merges several lists, each ordered newest first by its source, into one newest-first list.
 *
 * Keeps the order within each list, repeatedly taking whichever list head was updated most
 * recently. On equal times the list passed first wins. Of items with the same id, only the first is
 * kept.
 *
 * @remarks
 * Lists aren't re-sorted by time because the source's order can be more accurate than the times at
 * hand (GitHub's web search orders by update, but its response only carries the creation time).
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
    // GitHub subtitles are <owner>/<repo>#<number>
    GitHub: () => item.subtitle.replace(/#\d+$/, ""),
    Gmail: () => item.subtitle,
  })

/**
 * Reorders a live folder's items in the given sort order.
 *
 * `items` must be in the newest-first order the source gave. Newest keeps that order and oldest
 * reverses it. Items that tie under title order or source order (grouped by repository for GitHub,
 * by sender for Gmail) stay newest first. Text comparison ignores case, and digits compare by
 * numeric value.
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
