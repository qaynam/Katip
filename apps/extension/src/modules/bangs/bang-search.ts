import { Array, Option, Order, pipe } from "effect"
import type { Bang } from "./bang"

const hostOf = (template: string) =>
  (/^https?:\/\/([^/?#]+)/i.exec(template)?.[1] ?? "").toLowerCase().replace(/^www\./, "")

const isWordStart = (text: string, index: number) =>
  index === 0 || !/[\p{L}\p{N}]/u.test(text.charAt(index - 1))

const hasWordStartingWith = (text: string, term: string) => {
  for (let at = text.indexOf(term); at !== -1; at = text.indexOf(term, at + 1)) {
    if (isWordStart(text, at)) return true
  }
  return false
}

// A trigger typed in full is the surest sign of the site meant; a name is surer than a host name,
// which is surer than the start of a trigger
const scoreOf = (bang: Bang, term: string): Option.Option<number> => {
  const name = bang.name.toLowerCase()
  const host = hostOf(bang.template)
  if (bang.triggers.includes(term)) return Option.some(100)
  if (name === term) return Option.some(95)
  if (name.startsWith(term)) return Option.some(80)
  if (host.startsWith(term)) return Option.some(70)
  if (bang.triggers.some((trigger) => trigger.startsWith(term))) return Option.some(60)
  if (hasWordStartingWith(name, term)) return Option.some(50)
  if (name.includes(term) || host.includes(term)) return Option.some(30)
  return Option.none()
}

const bestFirst = Order.combineAll<readonly [Bang, number]>([
  Order.flip(Order.mapInput(Order.Number, ([, score]) => score)),
  Order.mapInput(Order.Number, ([bang]) => bang.name.length),
])

/**
 * The bangs whose name, host name or trigger matches `text`, best match first. A leading `!` is
 * ignored, so a trigger can be looked up as it is typed in Spotlight. Empty for a blank text.
 */
export const searchBangs = (
  bangs: ReadonlyArray<Bang>,
  text: string,
  limit: number,
): ReadonlyArray<Bang> => {
  const term = text.trim().replace(/^!/, "").toLowerCase()
  if (term === "") return []
  return pipe(
    bangs.flatMap((bang) =>
      Option.match(scoreOf(bang, term), {
        onNone: () => [],
        onSome: (score) => [[bang, score] as const],
      }),
    ),
    Array.sort(bestFirst),
    Array.map(([bang]) => bang),
  ).slice(0, limit)
}
