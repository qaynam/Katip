import { Effect, Queue, Stream } from "effect"

export interface HeldStream<A> {
  readonly push: (value: A) => void
  readonly end: () => void
  readonly stream: Stream.Stream<A>
}

interface Subscriber<A> {
  readonly next: (value: A) => void
  readonly end: () => void
}

/**
 * 購読者が現れるまで値を溜め、以降は購読中の全員へ配る Stream を作る。
 *
 * @remarks
 * 溜めていた値は最初の購読者だけが受け取る。2 番目以降の購読者は購読を始めた後の値だけを受け取る。
 * `end` の後に購読すると、溜めていた値（あれば）を受け取ってすぐ終わる。
 * `push` と `end` は Chrome のリスナーのような Effect の外から同期的に呼べる。
 */
export const makeHeldStream = <A>(): HeldStream<A> => {
  let held: Array<A> | undefined = []
  let ended = false
  const subscribers = new Set<Subscriber<A>>()

  const subscribe = (subscriber: Subscriber<A>): (() => void) => {
    if (held !== undefined) {
      const backlog = held
      held = undefined
      backlog.forEach(subscriber.next)
    }
    if (ended) {
      subscriber.end()
      return () => {}
    }
    subscribers.add(subscriber)
    return () => subscribers.delete(subscriber)
  }

  return {
    push: (value) => {
      if (ended) return
      if (held !== undefined) {
        held.push(value)
        return
      }
      subscribers.forEach((subscriber) => subscriber.next(value))
    },
    end: () => {
      if (ended) return
      ended = true
      subscribers.forEach((subscriber) => subscriber.end())
      subscribers.clear()
    },
    stream: Stream.callback<A>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() =>
          subscribe({
            next: (value) => Queue.offerUnsafe(queue, value),
            end: () => Queue.endUnsafe(queue),
          }),
        ),
        (unsubscribe) => Effect.sync(unsubscribe),
      ),
    ),
  }
}
