import { Option } from "effect"
import type { Equivalence } from "effect"

export interface CoalescingSender<A> {
  /** 最初の値はすぐに送り、以後は間隔内に届いた値をまとめて、間隔の終わりに最新の値だけを送る */
  readonly push: (value: A) => void
  /** 送っていない値があれば、間隔を待たずに今すぐ送る */
  readonly flush: () => void
}

export interface CoalescingSenderOptions<A> {
  readonly intervalMs: number
  readonly send: (value: A) => void
  /** 直前に送った値と同じとみなす値は送らない */
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
