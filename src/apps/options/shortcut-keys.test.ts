import { describe, expect, it } from "vitest"
import { keysOfShortcut } from "./shortcut-keys"

describe("keysOfShortcut", () => {
  it.each([
    ["Alt+T", ["Alt", "T"]],
    ["Ctrl+Shift+C", ["Ctrl", "Shift", "C"]],
    ["Ctrl+Shift+Space", ["Ctrl", "Shift", "Space"]],
  ])("splits %s, written with plus signs, at each plus sign", (shortcut, keys) => {
    expect(keysOfShortcut(shortcut)).toStrictEqual({ keys, separator: "+" })
  })

  it.each([
    ["⌥T", ["⌥", "T"]],
    ["⌃⌘S", ["⌃", "⌘", "S"]],
    ["⌃⇧⌘C", ["⌃", "⇧", "⌘", "C"]],
    ["⌥Space", ["⌥", "Space"]],
  ])("splits the macOS shortcut %s into each modifier glyph and the key", (shortcut, keys) => {
    expect(keysOfShortcut(shortcut)).toStrictEqual({ keys, separator: "" })
  })

  it.each(["Alt+T", "⌃⇧⌘C", "⌥Space"])(
    "joining the keys of %s with its separator gives back the shortcut",
    (shortcut) => {
      const { keys, separator } = keysOfShortcut(shortcut)

      expect(keys.join(separator)).toBe(shortcut)
    },
  )
})
