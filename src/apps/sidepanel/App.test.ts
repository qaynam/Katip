import { fireEvent, screen } from "@testing-library/svelte"
import { tick } from "svelte"
import { describe, expect, it } from "vitest"
import { renderSidebar } from "./testing/render-sidebar"
import { sidebarView, spaceView, tabView } from "./testing/view-builders"

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

  it("アクティブな Space の色をサイドバー全体の色にする", async () => {
    const { container } = await renderSidebar(
      sidebarView({ spaces: [spaceView("work", { color: "orange" })] }),
    )

    expect(container.querySelector("[data-space-color]")?.getAttribute("data-space-color")).toBe(
      "orange",
    )
  })

  it("「新しいタブ」でこのウィンドウに新しいタブを開く", async () => {
    const { connection } = await renderSidebar(sidebarView())

    await fireEvent.click(screen.getByRole("button", { name: "新しいタブ" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "OpenNewTab", windowId: 1 }])
  })
})
