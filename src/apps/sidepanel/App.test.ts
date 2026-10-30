import { fireEvent, screen } from "@testing-library/svelte"
import { tick } from "svelte"
import { afterEach, describe, expect, it, vi } from "vitest"
import { appearanceOf, themeOf, type SpaceTheme } from "#modules/theme"
import { renderSidebar, shownAppearance } from "./testing/render-sidebar"
import { sidebarView, spaceView, tabView } from "./testing/view-builders"

const yellow = themeOf([{ hue: 90, chroma: 0.8 }])
const lightYellow: SpaceTheme = { ...yellow, mode: "light" }
const darkYellow: SpaceTheme = { ...yellow, mode: "dark" }

const viewWithTheme = (theme: SpaceTheme) =>
  sidebarView({ spaces: [spaceView("work", { theme }), spaceView("hobby")] })

const emulateSystemScheme = (scheme: "light" | "dark") =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: scheme === "dark" && query.includes("dark"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }))

describe("サイドバー全体", () => {
  it("ビューが届くまでは読み込み中であることを示す", async () => {
    await renderSidebar(null)

    expect(screen.getByText("サイドバーを読み込んでいます…")).toBeTruthy()
  })

  it("background からの通知をトーストで表示する", async () => {
    const { connection } = await renderSidebar(sidebarView())

    connection.pushNotice("タブをアーカイブしました")
    await tick()

    expect(screen.getByRole("status").textContent).toContain("タブをアーカイブしました")
  })

  it("コマンドが失敗したら、その理由をトーストで表示する", async () => {
    await renderSidebar(
      sidebarView({ spaces: [spaceView("work", { temporaryTabs: [tabView(1)] })] }),
      {
        respond: () => ({ outcome: { _tag: "Failed", reason: "タブが見つかりません" } }),
      },
    )

    await fireEvent.click(screen.getByRole("button", { name: "タブ 1" }))
    await tick()

    expect(screen.getByRole("status").textContent).toContain("タブが見つかりません")
  })

  it("「新しいタブ」でこのウィンドウに新しいタブを開く", async () => {
    const { connection } = await renderSidebar(sidebarView())

    await fireEvent.click(screen.getByRole("button", { name: "新しいタブ" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "OpenNewTab", windowId: 1 }])
  })

  it("上部の「検索」で、このウィンドウに Spotlight を開く", async () => {
    const { connection } = await renderSidebar(sidebarView())

    await fireEvent.click(screen.getByRole("button", { name: "検索" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "OpenSpotlight", windowId: 1 }])
  })
})

describe("Space のテーマ", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("明るい背景のテーマでは、濃い文字色で塗る", async () => {
    const { container } = await renderSidebar(viewWithTheme(lightYellow))

    const shown = shownAppearance(container)

    expect(shown.text).toBe(appearanceOf(lightYellow, "light").text)
    expect(shown.text).toMatch(/^rgb\(28 28 31/)
  })

  it("暗い背景のテーマでは、白い文字色で塗る", async () => {
    const { container } = await renderSidebar(viewWithTheme(darkYellow))

    expect(shownAppearance(container).text).toMatch(/^rgb\(255 255 255/)
  })

  it("表示中の Space のテーマの背景で全体を塗る", async () => {
    const { container } = await renderSidebar(viewWithTheme(lightYellow))

    expect(shownAppearance(container).background).toBe(
      appearanceOf(lightYellow, "light").background,
    )
  })

  it("2 色以上のテーマでは背景がグラデーションになる", async () => {
    const gradient = themeOf([
      { hue: 90, chroma: 0.8 },
      { hue: 25, chroma: 0.8 },
    ])

    const { container } = await renderSidebar(viewWithTheme(gradient))

    expect(shownAppearance(container).background).toMatch(/^linear-gradient\(/)
  })

  it("モードが自動のテーマは、OS がダークならダークで塗る", async () => {
    emulateSystemScheme("dark")

    const { container } = await renderSidebar(viewWithTheme(yellow))

    expect(shownAppearance(container).scheme).toBe("dark")
  })

  it("Space を切り替えると、切り替え先の Space のテーマで塗る", async () => {
    const { container, pushView } = await renderSidebar(viewWithTheme(lightYellow))
    const view = viewWithTheme(lightYellow)

    await pushView({ ...view, activeSpaceId: view.spaces[1]?.id ?? view.activeSpaceId })

    expect(shownAppearance(container).background).toBe(
      appearanceOf(view.spaces[1]?.theme ?? lightYellow, "light").background,
    )
  })
})
