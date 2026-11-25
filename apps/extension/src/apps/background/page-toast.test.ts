// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { type PageNotice, showPageToast } from "./page-toast"

const cardsShown = () =>
  [...document.querySelectorAll("katip-toast")].flatMap((host) => {
    const card = host.shadowRoot?.querySelector<HTMLElement>(".notice")
    return card === null || card === undefined ? [] : [card]
  })

const shownNotices = () =>
  cardsShown().map((card) => ({
    role: card.getAttribute("role"),
    title: card.querySelector(".title")?.textContent ?? null,
  }))

afterEach(() => {
  document.querySelectorAll("katip-toast").forEach((toast) => toast.remove())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("showPageToast", () => {
  it("shows the title as it is, without interpreting it as HTML", () => {
    showPageToast({ tone: "Done", title: "Copied <b>URL</b>" })

    expect(shownNotices()).toStrictEqual([{ role: "status", title: "Copied <b>URL</b>" }])
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

    rebuilt({ tone: "Done", title: "Copied Markdown link" })

    expect(shownNotices()).toStrictEqual([{ role: "status", title: "Copied Markdown link" }])
  })
})

describe("showPageToast with something to do on a click", () => {
  const opened = {
    tone: "Opened",
    title: "Opened in a new tab",
    action: {
      _tag: "Post",
      portName: "katip/page-notice",
      message: { _tag: "SwitchToTab", tabId: 7 },
    },
  } as const satisfies PageNotice

  const stubRuntime = () => {
    const posted: Array<{ readonly portName: string; readonly message: unknown }> = []
    vi.stubGlobal("chrome", {
      runtime: {
        connect: ({ name }: { readonly name: string }) => ({
          postMessage: (message: unknown) => posted.push({ portName: name, message }),
        }),
      },
    })
    return posted
  }

  it("is a button with the title", () => {
    showPageToast(opened)

    expect(cardsShown().map((card) => [card.tagName, card.textContent])).toStrictEqual([
      ["BUTTON", "Opened in a new tab"],
    ])
  })

  it("posts its message on its port when clicked, and leaves the page", () => {
    const posted = stubRuntime()
    showPageToast(opened)

    cardsShown()[0]?.click()

    expect([posted, cardsShown().length]).toStrictEqual([
      [{ portName: "katip/page-notice", message: { _tag: "SwitchToTab", tabId: 7 } }],
      0,
    ])
  })

  it("stays longer than a notice that can't be clicked, to leave time to reach it", () => {
    vi.useFakeTimers()
    showPageToast(opened)

    vi.advanceTimersByTime(4_000)
    const shownAfterAWhile = shownNotices().length
    vi.advanceTimersByTime(2_000)

    expect([shownAfterAWhile, shownNotices().length]).toStrictEqual([1, 0])
  })
})

describe("showPageToast with a page to share", () => {
  const copied = {
    tone: "Done",
    title: "Copied URL",
    action: { _tag: "Share", label: "Share", title: "Docs", url: "https://a.example/docs" },
  } as const satisfies PageNotice

  const shareButtonsShown = () =>
    cardsShown().flatMap((card) => [...card.querySelectorAll<HTMLButtonElement>("button.share")])

  const stubShare = () => {
    const shared: Array<ShareData> = []
    vi.stubGlobal("navigator", {
      share: (data: ShareData) => {
        shared.push(data)
        return Promise.resolve()
      },
      canShare: () => true,
    })
    return shared
  }

  it("has a button named after its label next to the title", () => {
    stubShare()

    showPageToast(copied)

    expect([
      shownNotices(),
      shareButtonsShown().map((button) => button.getAttribute("aria-label")),
    ]).toStrictEqual([[{ role: "status", title: "Copied URL" }], ["Share"]])
  })

  it("shares the page through the system's share menu when the button is clicked, and leaves", () => {
    const shared = stubShare()
    showPageToast(copied)

    shareButtonsShown()[0]?.click()

    expect([shared, cardsShown().length]).toStrictEqual([
      [{ title: "Docs", url: "https://a.example/docs" }],
      0,
    ])
  })

  it("has no button where the browser can't share, and leaves as soon as a plain notice does", () => {
    vi.stubGlobal("navigator", {})
    vi.useFakeTimers()
    showPageToast(copied)
    const buttons = shareButtonsShown().length

    vi.advanceTimersByTime(3_500)

    expect([buttons, shownNotices().length]).toStrictEqual([0, 0])
  })

  it("stays longer with the button, to leave time to reach it", () => {
    stubShare()
    vi.useFakeTimers()
    showPageToast(copied)

    vi.advanceTimersByTime(4_000)

    expect(shownNotices().length).toBe(1)
  })
})
