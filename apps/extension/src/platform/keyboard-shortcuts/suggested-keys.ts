// The order the browser writes modifiers in, which differs between macOS and other systems
const MAC_MODIFIERS: ReadonlyArray<readonly [name: string, glyph: string]> = [
  ["MacCtrl", "⌃"],
  ["Alt", "⌥"],
  ["Shift", "⇧"],
  // In a manifest's Mac keys, Ctrl stands for Command
  ["Command", "⌘"],
  ["Ctrl", "⌘"],
]
const OTHER_MODIFIERS = ["Ctrl", "Alt", "Shift"]

/**
 * A key as a manifest suggests it, such as `Command+MacCtrl+S`, written the way the browser shows
 * an assigned key, such as `⌃⌘S`, so the two can be shown side by side.
 */
export const shortcutAsShown = (suggested: string, isMac: boolean): string => {
  const parts = suggested.split("+")
  const key = parts.at(-1) ?? ""
  const modifiers = new Set(parts.slice(0, -1))
  if (isMac) {
    const glyphs = new Set(
      MAC_MODIFIERS.flatMap(([name, glyph]) => (modifiers.has(name) ? [glyph] : [])),
    )
    return [...glyphs].join("") + key
  }
  return [...OTHER_MODIFIERS.filter((name) => modifiers.has(name)), key].join("+")
}
