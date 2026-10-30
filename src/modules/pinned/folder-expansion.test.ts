import { describe, expect, it } from "vitest"
import { BookmarkId } from "#platform/browser"
import { isFolderExpanded, type FolderExpansion } from "./folder-expansion"

const folderId = BookmarkId.make("f1")

describe("フォルダの開閉状態", () => {
  it("保存値の無いフォルダは閉じている", () => {
    const expansion: FolderExpansion = {}

    expect(isFolderExpanded(expansion, folderId)).toBe(false)
  })

  it("開いた状態で保存したフォルダは開いている", () => {
    const expansion: FolderExpansion = { [folderId]: true }

    expect(isFolderExpanded(expansion, folderId)).toBe(true)
  })

  it("閉じた状態で保存したフォルダは閉じている", () => {
    const expansion: FolderExpansion = { [folderId]: false }

    expect(isFolderExpanded(expansion, folderId)).toBe(false)
  })

  it("ほかのフォルダの保存値は影響しない", () => {
    const expansion: FolderExpansion = { [BookmarkId.make("other")]: true }

    expect(isFolderExpanded(expansion, folderId)).toBe(false)
  })
})
