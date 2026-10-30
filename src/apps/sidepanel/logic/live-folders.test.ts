import { describe, expect, it } from "vitest"
import type { PinnedLiveFolderView } from "#protocol"
import {
  liveItem,
  pinnedFolder,
  pinnedLiveFolder,
  sidebarView,
  spaceView,
} from "../testing/view-builders"
import {
  hasRefreshedGitHubFolder,
  sourceOrigins,
  unseenBadgeText,
  unseenCount,
} from "./live-folders"

describe("unseenCount", () => {
  it("まだ開いていない項目だけを数える", () => {
    const folder = pinnedLiveFolder("inbox", {
      items: [
        liveItem("a", { isUnseen: true }),
        liveItem("b", { isUnseen: false }),
        liveItem("c", { isUnseen: true }),
      ],
    })

    expect(unseenCount(folder)).toBe(2)
  })

  it("項目が無ければ 0 件", () => {
    expect(unseenCount(pinnedLiveFolder("inbox", { items: [] }))).toBe(0)
  })
})

describe("unseenBadgeText", () => {
  it("99 件までは件数をそのまま出す", () => {
    expect(unseenBadgeText(1)).toBe("1")
    expect(unseenBadgeText(99)).toBe("99")
  })

  it("100 件以上は「99+」にまとめる", () => {
    expect(unseenBadgeText(100)).toBe("99+")
  })
})

describe("sourceOrigins", () => {
  it("Gmail は mail.google.com へのアクセスを求める", () => {
    expect(sourceOrigins("Gmail")).toStrictEqual(["https://mail.google.com/*"])
  })

  it("GitHub は api.github.com へのアクセスを求める", () => {
    expect(sourceOrigins("GitHub")).toStrictEqual(["https://api.github.com/*"])
  })
})

describe("hasRefreshedGitHubFolder", () => {
  const gitHubFolder = (status: PinnedLiveFolderView["status"]) =>
    pinnedLiveFolder("reviews", { source: { _tag: "GitHub", query: "review-requested" }, status })

  const viewWith = (...folders: ReadonlyArray<PinnedLiveFolderView>) =>
    sidebarView({
      spaces: [spaceView("work", { pinnedNodes: [pinnedFolder("nested", { children: folders })] })],
    })

  it("取得に成功した GitHub のライブフォルダがフォルダの中にあれば、トークンは使える", () => {
    expect(
      hasRefreshedGitHubFolder(viewWith(gitHubFolder({ _tag: "Ready", refreshedAt: 0 }))),
    ).toBe(true)
  })

  it("GitHub のライブフォルダが無ければ、トークンが使えるかは分からない", () => {
    expect(hasRefreshedGitHubFolder(viewWith(pinnedLiveFolder("inbox")))).toBe(false)
  })

  it("取得中や失敗した GitHub のライブフォルダしか無ければ、トークンが使えるかは分からない", () => {
    const failed = gitHubFolder({
      _tag: "Failed",
      reason: "トークンが無効です",
      needsPermission: false,
      needsToken: true,
    })

    expect(hasRefreshedGitHubFolder(viewWith(failed, gitHubFolder({ _tag: "Refreshing" })))).toBe(
      false,
    )
  })
})
