import type { Message } from "../../message"

/** Shown by the browser rather than by Katip: on its extensions and shortcuts pages, and in the store. */
export const manifest = {
  "manifest.description": "Organize your tabs into Spaces in the side panel",
  "manifest.command.openSidePanel": "Open the side panel",
  "manifest.command.openSpotlight": "Open the Command Palette to search tabs, pins, and Spaces",
  "manifest.command.editCurrentUrl":
    "Edit the active tab’s address in the Command Palette, opening what you choose in that tab",
  "manifest.command.copyUrl": "Copy the active tab’s URL (turn on in Katip’s settings)",
  "manifest.command.copyMarkdownLink":
    "Copy the active tab’s URL as a Markdown link (turn on in Katip’s settings)",
  "manifest.command.togglePin": "Pin or unpin the active tab",
  "manifest.command.nextTabInSpace": "Go to the next tab in the Space",
  "manifest.command.previousTabInSpace": "Go to the previous tab in the Space",
} as const satisfies Readonly<Record<`manifest.${string}`, Message>>
