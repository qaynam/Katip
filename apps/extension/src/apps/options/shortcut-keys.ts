/** A shortcut split into the keys to draw as keycaps. */
export interface ShortcutKeys {
  readonly keys: ReadonlyArray<string>
  /** Text the browser writes between two keys, kept so the keycaps read the same as the shortcut. */
  readonly separator: string
}

const MAC_MODIFIERS = new Set(["⌃", "⌥", "⇧", "⌘"])

/**
 * Splits a shortcut as the browser reports it, such as "Ctrl+Shift+C" or "⇧⌘C", into its keys.
 * Joining the keys with the separator gives back the shortcut.
 */
export const keysOfShortcut = (shortcut: string): ShortcutKeys => {
  if (shortcut.includes("+")) return { keys: shortcut.split("+"), separator: "+" }
  // Splitting on "+" alone would leave a macOS shortcut as one key: there the browser runs the
  // modifier glyphs together in front of the key, which may itself be a word like "Space"
  const characters = [...shortcut]
  const modifierCount = characters.findIndex((character) => !MAC_MODIFIERS.has(character))
  const modifiers = characters.slice(0, modifierCount === -1 ? characters.length : modifierCount)
  const key = characters.slice(modifiers.length).join("")
  return { keys: key === "" ? modifiers : [...modifiers, key], separator: "" }
}
