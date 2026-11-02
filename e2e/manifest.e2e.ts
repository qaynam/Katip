import type { Worker } from "@playwright/test"
import { expect, test } from "./fixtures"

const commandsIn = (background: Worker) =>
  background.evaluate(async () =>
    (await chrome.commands.getAll()).map(({ name, shortcut }) => ({ name, shortcut })),
  )

test("a fresh install gets keys for the side panel, Spotlight and both copy shortcuts", async ({
  background,
}) => {
  const keys = Object.fromEntries(
    (await commandsIn(background)).map(({ name, shortcut }) => [name, shortcut]),
  )

  expect(keys).toStrictEqual(
    process.platform === "darwin"
      ? {
          _execute_action: "⌃⌘S",
          "open-spotlight": "⌥T",
          "copy-current-url": "⌃⇧C",
          "copy-current-url-as-markdown": "⌃⇧M",
          "quick-pin-toggle": "",
          "next-tab-in-space": "",
          "previous-tab-in-space": "",
        }
      : {
          _execute_action: "Alt+S",
          "open-spotlight": "Alt+T",
          "copy-current-url": "Alt+C",
          "copy-current-url-as-markdown": "Alt+M",
          "quick-pin-toggle": "",
          "next-tab-in-space": "",
          "previous-tab-in-space": "",
        },
  )
})
