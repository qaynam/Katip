import { describe, expect, it } from "vitest"
import { canCreateFolderInside, maxFolderDepth, SPACE_ROOT_DEPTH } from "./folder-depth"

const syncOff = { isTabGroupSyncEnabled: false }
const syncOn = { isTabGroupSyncEnabled: true }

describe("with tab group sync off", () => {
  it("folders can be nested two levels deep", () => {
    expect(maxFolderDepth(syncOff)).toBe(2)
  })

  it("a folder can be created directly inside the Space", () => {
    expect(canCreateFolderInside(SPACE_ROOT_DEPTH, syncOff)).toBe(true)
  })

  it("a folder can be created inside a folder at depth 1", () => {
    expect(canCreateFolderInside(1, syncOff)).toBe(true)
  })

  it("no folder can be created inside a folder at depth 2", () => {
    expect(canCreateFolderInside(2, syncOff)).toBe(false)
  })

  it("no folder can be created inside a folder at depth 3 made outside Katip either", () => {
    expect(canCreateFolderInside(3, syncOff)).toBe(false)
  })
})

describe("with tab group sync on", () => {
  it("folders can be nested only one level deep", () => {
    expect(maxFolderDepth(syncOn)).toBe(1)
  })

  it("a folder can be created directly inside the Space", () => {
    expect(canCreateFolderInside(SPACE_ROOT_DEPTH, syncOn)).toBe(true)
  })

  it("no folder can be created inside a folder at depth 1", () => {
    expect(canCreateFolderInside(1, syncOn)).toBe(false)
  })
})
