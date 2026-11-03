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
 * Makes a Stream that holds values until the first subscriber arrives, then delivers each value to
 * every current subscriber.
 *
 * @remarks
 * Only the first subscriber receives the held values; later subscribers receive only values pushed
 * after they subscribe. Subscribing after `end` delivers the held values, if any, and ends at once.
 * `push` and `end` can be called synchronously from outside Effect, such as from a Chrome listener.
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
