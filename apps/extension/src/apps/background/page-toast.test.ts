// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { type PageNotice, showPageToast } from "./page-toast"

const shownNotices = () =>
  [...document.querySelectorAll("katip-toast")].map((host) => {
    const card = host.shadowRoot?.querySelector(".notice")
    return {
      role: card?.getAttribute("role") ?? null,
      title: card?.querySelector(".title")?.textContent ?? null,
      detail: card?.querySelector(".detail")?.textContent ?? null,
    }
  })

afterEach(() => {
  document.querySelectorAll("katip-toast").forEach((toast) => toast.remove())
  vi.useRealTimers()
})

describe("showPageToast", () => {
  it("shows the title and the detail as they are, without interpreting them as HTML", () => {
    showPageToast({ tone: "Done", title: "Copied <b>URL</b>", detail: "https://a.example/?q=<i>" })

    expect(shownNotices()).toStrictEqual([
      { role: "status", title: "Copied <b>URL</b>", detail: "https://a.example/?q=<i>" },
    ])
  })

  it("has no detail line for a notice without a detail", () => {
    showPageToast({ tone: "Done", title: "Copied URL" })

    expect(shownNotices()).toStrictEqual([{ role: "status", title: "Copied URL", detail: null }])
  })

  it("tells of a failure as an alert", () => {
    showPageToast({ tone: "Alert", title: "Couldn’t copy" })

    expect(shownNotices().map(({ role }) => role)).toStrictEqual(["alert"])
  })

  it("replaces a notice that is still on the page", () => {
    showPageToast({ tone: "Done", title: "first" })

    showPageToast({ tone: "Done", title: "second" })

    expect(shownNotices().map(({ title }) => title)).toStrictEqual(["second"])
  })

  it("stays for a couple of seconds, then leaves the page", () => {
    vi.useFakeTimers()
    showPageToast({ tone: "Done", title: "Copied URL" })

    vi.advanceTimersByTime(2_500)
    const shownAfterAWhile = shownNotices().length
    vi.advanceTimersByTime(1_000)

    expect([shownAfterAWhile, shownNotices().length]).toStrictEqual([1, 0])
  })

  it("works the same when rebuilt from its source text, without outer values", () => {
    const rebuilt = new Function(`return (${showPageToast.toString()})`)() as (
      notice: PageNotice,
    ) => void

    rebuilt({ tone: "Done", title: "Copied Markdown link", detail: "[Docs](https://a.example/)" })

    expect(shownNotices()).toStrictEqual([
      { role: "status", title: "Copied Markdown link", detail: "[Docs](https://a.example/)" },
    ])
  })
})
