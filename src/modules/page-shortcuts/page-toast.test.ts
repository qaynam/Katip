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

describe("ページの知らせ", () => {
  it("知らせの文を、HTML として解釈せずにそのまま出す", () => {
    showPageToast("<b>URL</b> をコピーしました")

    expect(shownToasts()).toStrictEqual(["<b>URL</b> をコピーしました"])
  })

  it("前の知らせが残っていれば、新しい知らせに置き換える", () => {
    showPageToast("1 つ目")

    showPageToast("2 つ目")

    expect(shownToasts()).toStrictEqual(["2 つ目"])
  })

  it("しばらくすると消える", () => {
    vi.useFakeTimers()
    showPageToast("URL をコピーしました")

    vi.advanceTimersByTime(2_000)

    expect(shownToasts()).toStrictEqual([])
  })

  it("文字列にして別の場所で作り直しても、外の値を使わずに同じ知らせを出す", () => {
    const rebuilt = new Function(`return (${showPageToast.toString()})`)() as (text: string) => void

    rebuilt("Markdown のリンクをコピーしました")

    expect(shownToasts()).toStrictEqual(["Markdown のリンクをコピーしました"])
  })
})
