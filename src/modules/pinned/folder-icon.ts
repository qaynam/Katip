import { Schema } from "effect"

/**
 * An icon a folder heading can show in place of the folder picture, in the order the icon
 * picker lists them.
 *
 * @remarks
 * The names end up in saved values, so they say what the picture depicts rather than where the
 * artwork comes from. The artwork can then be swapped without migrating saved values.
 */
export const FolderIcon = Schema.Literals([
  "star",
  "bookmark",
  "heart",
  "bolt",
  "triangle",
  "asterisk",
  "bell",
  "lightbulb",
  "chat",
  "people",
  "wrench",
  "egg",
  "circle",
  "moon",
  "planet",
  "leaf",
  "cloud",
  "paw",
  "hammer",
  "airplane",
  "music",
  "video",
  "code",
  "skull",
])
export type FolderIcon = typeof FolderIcon.Type
