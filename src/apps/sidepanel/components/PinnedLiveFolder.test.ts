import { fireEvent, screen, within } from "@testing-library/svelte"
import { describe, expect, it, vi } from "vitest"
import { BookmarkId } from "#platform/browser"
import type { PinnedLiveFolderView, PinnedNodeView } from "#protocol"
import { commandsOf, renderSidebar } from "../testing/render-sidebar"
import { liveItem, pinnedLiveFolder, sidebarView, spaceView } from "../testing/view-builders"

const viewWithPins = (...nodes: ReadonlyArray<PinnedNodeView>) =>
  sidebarView({ spaces: [spaceView("work", { pinnedNodes: nodes })] })

const inbox = (overrides: Partial<Omit<PinnedLiveFolderView, "_tag" | "bookmarkId">> = {}) =>
  pinnedLiveFolder("inbox", {
    title: "受信トレイ",
    items: [
      liveItem("quote", { title: "見積もりの件", subtitle: "山田 太郎", isUnseen: true }),
      liveItem("lunch", { title: "ランチのお誘い", isUnseen: true }),
      liveItem("report", { title: "週報", isUnseen: false }),
    ],
    ...overrides,
  })

const failed = (failure: { readonly needsPermission?: boolean; readonly needsToken?: boolean }) =>
  ({
    _tag: "Failed",
    reason: "取得できませんでした",
    needsPermission: failure.needsPermission ?? false,
    needsToken: failure.needsToken ?? false,
  }) as const

const header = (title: string) => screen.getByRole("button", { name: new RegExp(`^${title}`) })
const pinnedRegion = () => screen.getByRole("region", { name: "ピン留め" })

const openHeaderMenu = async (title: string) => {
  await fireEvent.contextMenu(header(title))
}

describe("ライブフォルダの表示", () => {
  it("閉じたライブフォルダには未読の件数だけが出て、項目は隠れる", async () => {
    await renderSidebar(viewWithPins(inbox({ isExpanded: false })))

    expect(header("受信トレイ").textContent).toContain("未読 2 件")
    expect(within(pinnedRegion()).queryByText("見積もりの件")).toBeNull()
  })

  it("開いたライブフォルダには項目が並び、未読の項目はそれと分かる", async () => {
    await renderSidebar(viewWithPins(inbox()))

    expect(screen.getByRole("button", { name: /見積もりの件/ }).textContent).toContain("未読")
    expect(screen.getByRole("button", { name: /週報/ }).textContent).not.toContain("未読")
  })

  it("項目の補足をタイトルの下に添える", async () => {
    await renderSidebar(viewWithPins(inbox()))

    expect(screen.getByRole("button", { name: /見積もりの件/ }).textContent).toContain("山田 太郎")
  })

  it("未読が無ければ件数を出さない", async () => {
    await renderSidebar(viewWithPins(inbox({ items: [liveItem("read")], isExpanded: false })))

    expect(header("受信トレイ").textContent).not.toContain("未読")
  })

  it("取得中であることを示す", async () => {
    await renderSidebar(viewWithPins(inbox({ status: { _tag: "Refreshing" } })))

    expect(header("受信トレイ").textContent).toContain("更新中")
  })

  it("項目が無ければ、新しい項目が無いことを示す", async () => {
    await renderSidebar(viewWithPins(inbox({ items: [] })))

    expect(within(pinnedRegion()).getByText("新しい項目はありません")).toBeTruthy()
  })
})

describe("ライブフォルダの操作", () => {
  it("項目をクリックすると、その項目を開く", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox()))

    await fireEvent.click(screen.getByRole("button", { name: /見積もりの件/ }))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "OpenLiveItem",
        windowId: 1,
        bookmarkId: BookmarkId.make("inbox"),
        itemId: "quote",
      },
    ])
  })

  it("見出しをクリックすると、今と逆の開閉状態にする", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox({ isExpanded: true })))

    await fireEvent.click(header("受信トレイ"))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SetFolderExpanded", bookmarkId: BookmarkId.make("inbox"), isExpanded: false },
    ])
  })

  it("右クリックの「今すぐ更新」で取得し直す", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox()))

    await openHeaderMenu("受信トレイ")
    await fireEvent.click(screen.getByRole("menuitem", { name: "今すぐ更新" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RefreshLiveFolder", bookmarkId: BookmarkId.make("inbox") },
    ])
  })

  it("右クリックの「すべて既読にする」で、すべての項目を見たことにする", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox()))

    await openHeaderMenu("受信トレイ")
    await fireEvent.click(screen.getByRole("menuitem", { name: "すべて既読にする" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "MarkLiveFolderSeen", bookmarkId: BookmarkId.make("inbox") },
    ])
  })

  it("未読が無ければ「すべて既読にする」は押せない", async () => {
    await renderSidebar(viewWithPins(inbox({ items: [liveItem("read")] })))

    await openHeaderMenu("受信トレイ")

    expect(
      screen.getByRole<HTMLButtonElement>("menuitem", { name: "すべて既読にする" }).disabled,
    ).toBe(true)
  })

  it("右クリックの「名前を変更」で、新しい名前を付ける", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox()))

    await openHeaderMenu("受信トレイ")
    await fireEvent.click(screen.getByRole("menuitem", { name: "名前を変更" }))
    const input = screen.getByRole("textbox", { name: "ライブフォルダの名前" })
    await fireEvent.input(input, { target: { value: "メール" } })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect(commandsOf(connection.sentCommands, "RenamePinnedItem")).toStrictEqual([
      { _tag: "RenamePinnedItem", bookmarkId: BookmarkId.make("inbox"), title: "メール" },
    ])
  })

  it("削除を確認ダイアログで承認すると、ライブフォルダを削除する", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox()))

    await openHeaderMenu("受信トレイ")
    await fireEvent.click(screen.getByRole("menuitem", { name: "ライブフォルダを削除" }))
    await fireEvent.click(await screen.findByRole("button", { name: "削除" }))

    expect(commandsOf(connection.sentCommands, "DeleteFolder")).toStrictEqual([
      { _tag: "DeleteFolder", bookmarkId: BookmarkId.make("inbox") },
    ])
  })

  it("削除を確認ダイアログで取り消すと、何も削除しない", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox()))

    await openHeaderMenu("受信トレイ")
    await fireEvent.click(screen.getByRole("menuitem", { name: "ライブフォルダを削除" }))
    await fireEvent.click(await screen.findByRole("button", { name: "キャンセル" }))

    expect(commandsOf(connection.sentCommands, "DeleteFolder")).toStrictEqual([])
  })
})

describe("取得に失敗したライブフォルダ", () => {
  it("失敗した理由を示す", async () => {
    await renderSidebar(viewWithPins(inbox({ status: failed({}) })))

    expect(within(pinnedRegion()).getByText("取得できませんでした")).toBeTruthy()
  })

  it("アクセスが許可されていなければ「アクセスを許可」で取得元へのアクセスを求め、許可されたら取得し直す", async () => {
    const { connection, originAccess } = await renderSidebar(
      viewWithPins(inbox({ status: failed({ needsPermission: true }) })),
    )

    await fireEvent.click(screen.getByRole("button", { name: "アクセスを許可" }))

    expect(originAccess.requestedOrigins).toStrictEqual([["https://mail.google.com/*"]])
    await vi.waitFor(() =>
      expect(connection.sentCommands).toStrictEqual([
        { _tag: "RefreshLiveFolder", bookmarkId: BookmarkId.make("inbox") },
      ]),
    )
  })

  it("アクセスを拒否されたら取得し直さず、許可が無いことを知らせる", async () => {
    const { connection } = await renderSidebar(
      viewWithPins(inbox({ status: failed({ needsPermission: true }) })),
      { grantsAccess: false },
    )

    await fireEvent.click(screen.getByRole("button", { name: "アクセスを許可" }))

    await vi.waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Gmail へのアクセスが許可されなかった",
      ),
    )
    expect(connection.sentCommands).toStrictEqual([])
  })

  it("トークンが無ければ「トークンを設定」で入れたトークンを保存し、取得し直す", async () => {
    const reviews = pinnedLiveFolder("reviews", {
      title: "レビュー依頼",
      source: { _tag: "GitHub", query: "review-requested" },
      status: failed({ needsToken: true }),
    })
    const { connection } = await renderSidebar(viewWithPins(reviews))

    await fireEvent.click(screen.getByRole("button", { name: "トークンを設定" }))
    await fireEvent.input(screen.getByLabelText("アクセストークン"), {
      target: { value: " ghp_secret " },
    })
    await fireEvent.click(screen.getByRole("button", { name: "保存" }))

    await vi.waitFor(() =>
      expect(connection.sentCommands).toStrictEqual([
        { _tag: "SetGitHubToken", token: "ghp_secret" },
        { _tag: "RefreshLiveFolder", bookmarkId: BookmarkId.make("reviews") },
      ]),
    )
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("トークンを空のまま保存しようとすると、入力を求めて何も送らない", async () => {
    const reviews = pinnedLiveFolder("reviews", {
      source: { _tag: "GitHub", query: "review-requested" },
      status: failed({ needsToken: true }),
    })
    const { connection } = await renderSidebar(viewWithPins(reviews))

    await fireEvent.click(screen.getByRole("button", { name: "トークンを設定" }))
    await fireEvent.click(screen.getByRole("button", { name: "保存" }))

    expect(screen.getByRole("alert").textContent).toBe("トークンを入力してください")
    expect(connection.sentCommands).toStrictEqual([])
  })

  it("許可やトークンで直らない失敗は「再試行」で取得し直す", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox({ status: failed({}) })))

    await fireEvent.click(screen.getByRole("button", { name: "再試行" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RefreshLiveFolder", bookmarkId: BookmarkId.make("inbox") },
    ])
  })
})
