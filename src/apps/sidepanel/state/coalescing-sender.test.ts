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

describe("間引いて送る", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("最初の値は待たずに送る", () => {
    const { sent, sender } = setup()

    sender.push(1)

    expect(sent).toStrictEqual([1])
  })

  it("間隔内に届いた値はまとめ、間隔の終わりに最新の値だけを送る", () => {
    const { sent, sender } = setup()
    sender.push(1)
    sender.push(2)
    sender.push(3)

    vi.advanceTimersByTime(150)

    expect(sent).toStrictEqual([1, 3])
  })

  it("変わり続けている間も、間隔ごとに 1 回は送る", () => {
    const { sent, sender } = setup()

    for (const value of [1, 2, 3, 4, 5]) {
      sender.push(value)
      vi.advanceTimersByTime(100)
    }

    expect(sent).toStrictEqual([1, 2, 3, 5])
  })

  it("確定すると、間隔を待たずに最新の値を送る", () => {
    const { sent, sender } = setup()
    sender.push(1)
    sender.push(2)

    sender.flush()

    expect(sent).toStrictEqual([1, 2])
  })

  it("確定したあと、待っていた分を間隔の終わりに重ねて送らない", () => {
    const { sent, sender } = setup()
    sender.push(1)
    sender.push(2)
    sender.flush()

    vi.advanceTimersByTime(300)

    expect(sent).toStrictEqual([1, 2])
  })

  it("直前に送った値と同じ値は送らない", () => {
    const { sent, sender } = setup()
    sender.push(1)
    vi.advanceTimersByTime(150)

    sender.push(1)
    sender.flush()

    expect(sent).toStrictEqual([1])
  })

  it("送る値が無いときに確定しても何も送らない", () => {
    const { sent, sender } = setup()

    sender.flush()

    expect(sent).toStrictEqual([])
  })
})
