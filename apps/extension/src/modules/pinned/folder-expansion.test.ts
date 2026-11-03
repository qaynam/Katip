import { describe, expect, it } from "vitest"
import { BookmarkId } from "#platform/browser"
import { isFolderExpanded, type FolderExpansion } from "./folder-expansion"

const folderId = BookmarkId.make("f1")

describe("folder expansion", () => {
  it("a folder with no saved value is collapsed", () => {
    const expansion: FolderExpansion = {}

    expect(isFolderExpanded(expansion, folderId)).toBe(false)
  })

  it("a folder saved as expanded is expanded", () => {
    const expansion: FolderExpansion = { [folderId]: true }

    expect(isFolderExpanded(expansion, folderId)).toBe(true)
  })

  it("a folder saved as collapsed is collapsed", () => {
    const expansion: FolderExpansion = { [folderId]: false }

    expect(isFolderExpanded(expansion, folderId)).toBe(false)
  })

  it("another folder's saved value has no effect", () => {
    const expansion: FolderExpansion = { [BookmarkId.make("other")]: true }

    expect(isFolderExpanded(expansion, folderId)).toBe(false)
  })
})
