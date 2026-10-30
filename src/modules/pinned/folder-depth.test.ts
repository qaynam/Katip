import { describe, expect, it } from "vitest"
import { canCreateFolderInside, maxFolderDepth, SPACE_ROOT_DEPTH } from "./folder-depth"

const syncOff = { isTabGroupSyncEnabled: false }
const syncOn = { isTabGroupSyncEnabled: true }

describe("タブグループ同期が OFF のとき", () => {
  it("フォルダは 2 階層まで作れる", () => {
    expect(maxFolderDepth(syncOff)).toBe(2)
  })

  it("Space 直下にフォルダを作れる", () => {
    expect(canCreateFolderInside(SPACE_ROOT_DEPTH, syncOff)).toBe(true)
  })

  it("深さ 1 のフォルダの中にフォルダを作れる", () => {
    expect(canCreateFolderInside(1, syncOff)).toBe(true)
  })

  it("深さ 2 のフォルダの中にはフォルダを作れない", () => {
    expect(canCreateFolderInside(2, syncOff)).toBe(false)
  })

  it("外部で作られた深さ 3 のフォルダの中にもフォルダを作れない", () => {
    expect(canCreateFolderInside(3, syncOff)).toBe(false)
  })
})

describe("タブグループ同期が ON のとき", () => {
  it("フォルダは 1 階層まで作れる", () => {
    expect(maxFolderDepth(syncOn)).toBe(1)
  })

  it("Space 直下にフォルダを作れる", () => {
    expect(canCreateFolderInside(SPACE_ROOT_DEPTH, syncOn)).toBe(true)
  })

  it("深さ 1 のフォルダの中にはフォルダを作れない", () => {
    expect(canCreateFolderInside(1, syncOn)).toBe(false)
  })
})
