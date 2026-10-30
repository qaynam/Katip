import { fireEvent, screen } from "@testing-library/svelte"
import { describe, expect, it, vi } from "vitest"
import { BookmarkId } from "#platform/browser"
import type { PinnedNodeView, SidebarCommand } from "#protocol"
import type { CommandResponse } from "../connection/memory-connection"
import { commandsOf, renderSidebar } from "../testing/render-sidebar"
import { pinnedFolder, pinnedLiveFolder, sidebarView, spaceView } from "../testing/view-builders"

const viewWithPins = (...nodes: ReadonlyArray<PinnedNodeView>) =>
  sidebarView({ spaces: [spaceView("work", { pinnedNodes: nodes })] })

const createdLiveFolder = (command: SidebarCommand): CommandResponse => ({
  outcome: {
    _tag: "Succeeded",
    createdBookmarkId: command._tag === "CreateLiveFolder" ? BookmarkId.make("created") : null,
  },
})

const chooseFromSpaceMenu = async (source: "Gmail" | "GitHub") => {
  await fireEvent.click(screen.getByRole("button", { name: "Space のメニュー" }))
  await fireEvent.click(screen.getByRole("menuitem", { name: "ライブフォルダを追加" }))
  await fireEvent.click(screen.getByRole("menuitem", { name: source }))
}

const chooseFromFolderMenu = async (folderTitle: string, source: "Gmail" | "GitHub") => {
  await fireEvent.contextMenu(screen.getByRole("button", { name: folderTitle }))
  await fireEvent.click(screen.getByRole("menuitem", { name: "ライブフォルダを追加" }))
  await fireEvent.click(screen.getByRole("menuitem", { name: source }))
}

const fillIn = (label: string, value: string) =>
  fireEvent.input(screen.getByLabelText(label), { target: { value } })

describe("Gmail のライブフォルダを作るとき", () => {
  it("入力したアカウントとラベルで、Gmail へのアクセスを求めてから作る", async () => {
    const { connection, originAccess } = await renderSidebar(viewWithPins(), {
      respond: createdLiveFolder,
    })

    await chooseFromSpaceMenu("Gmail")
    await fillIn("アカウント番号", "1")
    await fillIn("ラベル", "仕事")
    await fireEvent.click(screen.getByRole("button", { name: "作成" }))

    expect(originAccess.requestedOrigins).toStrictEqual([["https://mail.google.com/*"]])
    await vi.waitFor(() =>
      expect(connection.sentCommands).toStrictEqual([
        {
          _tag: "CreateLiveFolder",
          spaceId: "work",
          parentId: null,
          source: { _tag: "Gmail", accountIndex: 1, label: "仕事" },
        },
      ]),
    )
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("何も変えずに作れば、最初のアカウントの受信トレイになる", async () => {
    const { connection } = await renderSidebar(viewWithPins(), { respond: createdLiveFolder })

    await chooseFromSpaceMenu("Gmail")
    await fireEvent.click(screen.getByRole("button", { name: "作成" }))

    await vi.waitFor(() =>
      expect(commandsOf(connection.sentCommands, "CreateLiveFolder")).toMatchObject([
        { source: { _tag: "Gmail", accountIndex: 0, label: null } },
      ]),
    )
  })

  it("アクセスを拒否されたら作らずに、許可が要ることを知らせてダイアログを残す", async () => {
    const { connection } = await renderSidebar(viewWithPins(), { grantsAccess: false })

    await chooseFromSpaceMenu("Gmail")
    await fireEvent.click(screen.getByRole("button", { name: "作成" }))

    await vi.waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Gmail へのアクセスが許可されなかったため、作成しませんでした",
      ),
    )
    expect(connection.sentCommands).toStrictEqual([])
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("アカウント番号が整数でなければ、アクセスを求めずに直し方を示す", async () => {
    const { connection, originAccess } = await renderSidebar(viewWithPins())

    await chooseFromSpaceMenu("Gmail")
    await fillIn("アカウント番号", "一")
    await fireEvent.click(screen.getByRole("button", { name: "作成" }))

    expect(screen.getByRole("alert").textContent).toBe(
      "アカウント番号は 0 以上の整数で入力してください",
    )
    expect(originAccess.requestedOrigins).toStrictEqual([])
    expect(connection.sentCommands).toStrictEqual([])
  })

  it("キャンセルすれば何も作らない", async () => {
    const { connection } = await renderSidebar(viewWithPins())

    await chooseFromSpaceMenu("Gmail")
    await fireEvent.click(screen.getByRole("button", { name: "キャンセル" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(connection.sentCommands).toStrictEqual([])
  })
})

describe("GitHub のライブフォルダを作るとき", () => {
  it("選んだ種類で、GitHub へのアクセスを求めてから作る", async () => {
    const { connection, originAccess } = await renderSidebar(viewWithPins(), {
      respond: createdLiveFolder,
    })

    await chooseFromSpaceMenu("GitHub")
    await fireEvent.click(screen.getByRole("radio", { name: "担当の Issue" }))
    await fireEvent.click(screen.getByRole("button", { name: "作成" }))

    expect(originAccess.requestedOrigins).toStrictEqual([["https://api.github.com/*"]])
    await vi.waitFor(() =>
      expect(commandsOf(connection.sentCommands, "CreateLiveFolder")).toStrictEqual([
        {
          _tag: "CreateLiveFolder",
          spaceId: "work",
          parentId: null,
          source: { _tag: "GitHub", query: "assigned-issues" },
        },
      ]),
    )
  })

  it("トークンを入れたら、作る前にトークンを保存する", async () => {
    const { connection } = await renderSidebar(viewWithPins(), { respond: createdLiveFolder })

    await chooseFromSpaceMenu("GitHub")
    await fillIn("アクセストークン", "ghp_secret")
    await fireEvent.click(screen.getByRole("button", { name: "作成" }))

    await vi.waitFor(() =>
      expect(connection.sentCommands.map((command) => command._tag)).toStrictEqual([
        "SetGitHubToken",
        "CreateLiveFolder",
      ]),
    )
    expect(commandsOf(connection.sentCommands, "SetGitHubToken")).toStrictEqual([
      { _tag: "SetGitHubToken", token: "ghp_secret" },
    ])
  })

  it("トークンの作り方と発行ページへのリンクを示す", async () => {
    await renderSidebar(viewWithPins())

    await chooseFromSpaceMenu("GitHub")

    expect(
      screen.getByRole<HTMLAnchorElement>("link", { name: "github.com でトークンを発行する" }).href,
    ).toMatch(/^https:\/\/github\.com\/settings\/tokens\/new/)
  })

  it("取得に成功した GitHub のライブフォルダがあれば、トークンの欄を出さない", async () => {
    await renderSidebar(
      viewWithPins(
        pinnedLiveFolder("reviews", { source: { _tag: "GitHub", query: "review-requested" } }),
      ),
    )

    await chooseFromSpaceMenu("GitHub")

    expect(screen.queryByLabelText("アクセストークン")).toBeNull()
  })
})

describe("フォルダの中にライブフォルダを作るとき", () => {
  it("そのフォルダの中に作り、閉じていたフォルダを開く", async () => {
    const { connection } = await renderSidebar(
      viewWithPins(pinnedFolder("docs", { title: "資料", isExpanded: false })),
      { respond: createdLiveFolder },
    )

    await chooseFromFolderMenu("資料", "Gmail")
    await fireEvent.click(screen.getByRole("button", { name: "作成" }))

    await vi.waitFor(() =>
      expect(connection.sentCommands).toStrictEqual([
        {
          _tag: "CreateLiveFolder",
          spaceId: "work",
          parentId: BookmarkId.make("docs"),
          source: { _tag: "Gmail", accountIndex: 0, label: null },
        },
        { _tag: "SetFolderExpanded", bookmarkId: BookmarkId.make("docs"), isExpanded: true },
      ]),
    )
  })

  it("サブフォルダを作れないフォルダのメニューには出さない", async () => {
    await renderSidebar(
      viewWithPins(pinnedFolder("docs", { title: "資料", canCreateSubfolder: false })),
    )

    await fireEvent.contextMenu(screen.getByRole("button", { name: "資料" }))

    expect(screen.queryByRole("menuitem", { name: "ライブフォルダを追加" })).toBeNull()
  })
})
