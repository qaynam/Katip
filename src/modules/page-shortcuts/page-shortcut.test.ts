import { describe, expect, it } from "vitest"
import { pageShortcutLabel, pageShortcutOf, type PressedKeys } from "./page-shortcut"

const press = (keys: Partial<PressedKeys>): PressedKeys => ({
  code: "KeyC",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...keys,
})

describe("pageShortcutOf", () => {
  describe("Mac", () => {
    it("⌘⇧C は URL のコピー", () => {
      expect(pageShortcutOf(press({ metaKey: true, shiftKey: true }), "mac")).toBe("CopyUrl")
    })

    it("⌥⌘⇧C は Markdown のリンクとしてのコピー", () => {
      expect(pageShortcutOf(press({ metaKey: true, shiftKey: true, altKey: true }), "mac")).toBe(
        "CopyMarkdownLink",
      )
    })

    it("Control を使った組み合わせは、ほかのアプリの操作なので受け取らない", () => {
      expect(pageShortcutOf(press({ ctrlKey: true, shiftKey: true }), "mac")).toBeNull()
      expect(
        pageShortcutOf(press({ metaKey: true, ctrlKey: true, shiftKey: true }), "mac"),
      ).toBeNull()
    })
  })

  describe("Windows と Linux", () => {
    it("Ctrl+Shift+C は URL のコピー", () => {
      expect(pageShortcutOf(press({ ctrlKey: true, shiftKey: true }), "other")).toBe("CopyUrl")
    })

    it("Ctrl+Shift+Alt+C は Markdown のリンクとしてのコピー", () => {
      expect(pageShortcutOf(press({ ctrlKey: true, shiftKey: true, altKey: true }), "other")).toBe(
        "CopyMarkdownLink",
      )
    })
  })

  it("Shift を押していなければ、ふつうのコピーなので受け取らない", () => {
    expect(pageShortcutOf(press({ metaKey: true }), "mac")).toBeNull()
  })

  it("C 以外のキーは受け取らない", () => {
    expect(pageShortcutOf(press({ code: "KeyV", metaKey: true, shiftKey: true }), "mac")).toBeNull()
  })
})

describe("pageShortcutLabel", () => {
  it("Mac では記号で書く", () => {
    expect(pageShortcutLabel("CopyMarkdownLink", "mac")).toBe("⌥⇧⌘C")
  })

  it("Windows と Linux では + でつないで書く", () => {
    expect(pageShortcutLabel("CopyUrl", "other")).toBe("Ctrl+Shift+C")
  })
})
