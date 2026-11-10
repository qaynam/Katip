import { describe, expect, it } from "vitest"
import { shortcutAsShown } from "./suggested-keys"

describe("a key the manifest suggests, written the way the browser shows assigned keys", () => {
  it.each([
    ["Command+MacCtrl+S", "⌃⌘S"],
    ["MacCtrl+Shift+C", "⌃⇧C"],
    ["Alt+T", "⌥T"],
    ["Ctrl+Shift+K", "⇧⌘K"],
  ])("on a Mac, %s is %s, with the modifiers in the Mac's order", (suggested, shown) => {
    expect(shortcutAsShown(suggested, true)).toBe(shown)
  })

  it.each([
    ["Alt+S", "Alt+S"],
    ["Shift+Ctrl+C", "Ctrl+Shift+C"],
  ])("elsewhere, %s is %s", (suggested, shown) => {
    expect(shortcutAsShown(suggested, false)).toBe(shown)
  })
})
