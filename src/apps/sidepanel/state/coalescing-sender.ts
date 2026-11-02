import { Option } from "effect"
import type { Equivalence } from "effect"

export interface CoalescingSender<A> {
  /**
   * Sends the first value at once. Values pushed during the following interval are coalesced,
   * and only the latest is sent when the interval ends.
   */
  readonly push: (value: A) => void
  /** Sends any unsent value now instead of waiting for the interval. */
  readonly flush: () => void
}

export interface CoalescingSenderOptions<A> {
  readonly intervalMs: number
  readonly send: (value: A) => void
  /** Values considered the same as the last sent one are not sent. */
  readonly isSame: Equivalence.Equivalence<A>
}

export const createCoalescingSender = <A>(
  options: CoalescingSenderOptions<A>,
): CoalescingSender<A> => {
  let pending = Option.none<A>()
  let lastSent = Option.none<A>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const sendPending = () => {
    const value = pending
    pending = Option.none()
    if (Option.isNone(value)) return
    if (Option.isSome(lastSent) && options.isSame(lastSent.value, value.value)) return
    lastSent = value
    options.send(value.value)
  }

  const startInterval = () => {
    timer = setTimeout(() => {
      timer = null
      if (Option.isNone(pending)) return
      sendPending()
      startInterval()
    }, options.intervalMs)
  }

  return {
    push: (value) => {
      pending = Option.some(value)
      if (timer !== null) return
      sendPending()
      startInterval()
    },
    flush: () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
      sendPending()
    },
  }
}
