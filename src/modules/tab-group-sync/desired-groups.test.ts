import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId, SpaceName, type Space } from "#modules/space"
import { assignTab, bindPinned, emptyWorkspace, switchSpace } from "#modules/workspace"
import { BookmarkId, TabId, WindowId, type BrowserTab } from "#platform/browser"
import { desiredGroupsFor } from "./desired-groups"

const spaceId = (value: string) => SpaceId.make(value)
const space = (id: string, color: Space["color"]): Space => ({
  id: spaceId(id),
  name: SpaceName.make(id),
  color,
})
const spaces = [space("home", "blue"), space("work", "red")]

const tab = (id: number, windowId: number, index: number, pinned = false) =>
  ({
    id: TabId.make(id),
    windowId: WindowId.make(windowId),
    index,
    pinned,
  }) as BrowserTab

describe("desiredGroupsFor", () => {
  it("ウィンドウごと・Space ごとに、名前と色を付けたグループを index 順のタブで作る", () => {
    const workspace = [
      [1, "home"],
      [2, "work"],
      [3, "home"],
    ].reduce(
      (acc, [id, space]) => assignTab(acc, TabId.make(id as number), spaceId(space as string), 0),
      switchSpace(emptyWorkspace, WindowId.make(1), spaceId("home")),
    )

    const groups = desiredGroupsFor(spaces, workspace, [tab(3, 1, 2), tab(1, 1, 0), tab(2, 1, 1)])

    expect(groups.map((g) => [g.spaceId, g.title, g.color, g.tabIds])).toStrictEqual([
      ["home", "home", "blue", [1, 3]],
      ["work", "work", "red", [2]],
    ])
  })

  it("そのウィンドウのアクティブ Space 以外のグループは折りたたむ", () => {
    const workspace = assignTab(
      assignTab(
        switchSpace(emptyWorkspace, WindowId.make(1), spaceId("work")),
        TabId.make(1),
        spaceId("home"),
        0,
      ),
      TabId.make(2),
      spaceId("work"),
      0,
    )

    const groups = desiredGroupsFor(spaces, workspace, [tab(1, 1, 0), tab(2, 1, 1)])

    expect(groups.map((g) => [g.spaceId, g.collapsed])).toStrictEqual([
      ["home", true],
      ["work", false],
    ])
  })

  it("ピン留めのタブも Space のグループに入り、Chrome で固定されたタブと所属の無いタブは入らない", () => {
    const workspace = bindPinned(
      assignTab(emptyWorkspace, TabId.make(1), spaceId("home"), 0),
      TabId.make(1),
      { bookmarkId: BookmarkId.make("b"), pinnedUrl: "https://a.example/" },
    )

    const groups = desiredGroupsFor(spaces, workspace, [
      tab(9, 1, 0, true),
      tab(1, 1, 1),
      tab(8, 1, 2),
    ])

    expect(groups.map((g) => g.tabIds)).toStrictEqual([[1]])
  })

  it("別々のウィンドウにある同じ Space のタブは、ウィンドウごとに別のグループになる", () => {
    const workspace = assignTab(
      assignTab(emptyWorkspace, TabId.make(1), spaceId("home"), 0),
      TabId.make(2),
      spaceId("home"),
      0,
    )

    const groups = desiredGroupsFor(spaces, workspace, [tab(1, 1, 0), tab(2, 2, 0)])

    expect(groups.map((g) => [g.windowId, g.tabIds])).toStrictEqual([
      [1, [1]],
      [2, [2]],
    ])
  })

  it("アクティブ Space が決まっていないウィンドウのグループは折りたたまない", () => {
    const workspace = assignTab(emptyWorkspace, TabId.make(1), spaceId("home"), 0)

    const groups = desiredGroupsFor(spaces, workspace, [tab(1, 1, 0)])

    expect(Option.fromNullishOr(groups[0]?.collapsed)).toStrictEqual(Option.some(false))
  })
})
