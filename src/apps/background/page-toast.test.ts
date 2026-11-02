// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { showPageToast } from "./page-toast"

const shownToasts = () =>
  [...document.querySelectorAll("katip-toast")].map(
    (host) => host.shadowRoot?.querySelector(".toast")?.textContent ?? null,
  )

afterEach(() => {
  document.querySelectorAll("katip-toast").forEach((toast) => toast.remove())
  vi.useRealTimers()
})

describe("showPageToast", () => {
  it("shows the text as is, without interpreting it as HTML", () => {
    showPageToast("Copied <b>URL</b>")

    expect(shownToasts()).toStrictEqual(["Copied <b>URL</b>"])
  })

  it("replaces a notice that is still on the page", () => {
    showPageToast("first")

    showPageToast("second")

    expect(shownToasts()).toStrictEqual(["second"])
  })

  it("disappears after a moment", () => {
    vi.useFakeTimers()
    showPageToast("Copied URL")

    vi.advanceTimersByTime(2_000)

    expect(shownToasts()).toStrictEqual([])
  })

  it("works the same when rebuilt from its source text, without outer values", () => {
    const rebuilt = new Function(`return (${showPageToast.toString()})`)() as (text: string) => void

    rebuilt("Copied Markdown link")

    expect(shownToasts()).toStrictEqual(["Copied Markdown link"])
  })
})
