import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createCoalescingSender } from "./coalescing-sender"

const setup = () => {
  const sent: Array<number> = []
  const sender = createCoalescingSender<number>({
    intervalMs: 150,
    send: (value) => sent.push(value),
    isSame: (a, b) => a === b,
  })
  return { sent, sender }
}

describe("Throttled sending", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("sends the first value without waiting", () => {
    const { sent, sender } = setup()

    sender.push(1)

    expect(sent).toStrictEqual([1])
  })

  it("coalesces values pushed within the interval and sends only the latest at its end", () => {
    const { sent, sender } = setup()
    sender.push(1)
    sender.push(2)
    sender.push(3)

    vi.advanceTimersByTime(150)

    expect(sent).toStrictEqual([1, 3])
  })

  it("sends at least once per interval while values keep changing", () => {
    const { sent, sender } = setup()

    for (const value of [1, 2, 3, 4, 5]) {
      sender.push(value)
      vi.advanceTimersByTime(100)
    }

    expect(sent).toStrictEqual([1, 2, 3, 5])
  })

  it("sends the latest value without waiting for the interval on flush", () => {
    const { sent, sender } = setup()
    sender.push(1)
    sender.push(2)

    sender.flush()

    expect(sent).toStrictEqual([1, 2])
  })

  it("doesn't send the flushed value again when the interval ends", () => {
    const { sent, sender } = setup()
    sender.push(1)
    sender.push(2)
    sender.flush()

    vi.advanceTimersByTime(300)

    expect(sent).toStrictEqual([1, 2])
  })

  it("doesn't send a value equal to the last one sent", () => {
    const { sent, sender } = setup()
    sender.push(1)
    vi.advanceTimersByTime(150)

    sender.push(1)
    sender.flush()

    expect(sent).toStrictEqual([1])
  })

  it("sends nothing on flush when there is nothing to send", () => {
    const { sent, sender } = setup()

    sender.flush()

    expect(sent).toStrictEqual([])
  })
})
