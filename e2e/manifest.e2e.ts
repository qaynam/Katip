import type { Worker } from "@playwright/test"
import { makeTranslator, type Translator } from "#modules/i18n"
import { extensionWorkerOf, launchWithExtension } from "./browser-launch"
import { EXTENSION_DIR } from "./extension-dir"
import { expect, test } from "./fixtures"

const commandsIn = (background: Worker) =>
  background.evaluate(async () =>
    (await chrome.commands.getAll()).map(({ name, shortcut, description }) => ({
      name,
      shortcut,
      description,
    })),
  )

/** What the browser's extensions and shortcuts pages show for Katip. */
const descriptionsIn = async (background: Worker) => ({
  extension: await background.evaluate(() => chrome.runtime.getManifest().description),
  commands: Object.fromEntries(
    (await commandsIn(background))
      // Chrome lists this one under its own name, "Activate the extension", not ours
      .filter(({ name }) => name !== "_execute_action")
      .map(({ name, description }) => [name, description]),
  ),
})

const descriptionsTranslatedBy = (translator: Translator) => ({
  extension: translator.t("manifest.description"),
  commands: {
    "open-spotlight": translator.t("manifest.command.openSpotlight"),
    "copy-current-url": translator.t("manifest.command.copyUrl"),
    "copy-current-url-as-markdown": translator.t("manifest.command.copyMarkdownLink"),
    "quick-pin-toggle": translator.t("manifest.command.togglePin"),
    "next-tab-in-space": translator.t("manifest.command.nextTabInSpace"),
    "previous-tab-in-space": translator.t("manifest.command.previousTabInSpace"),
  },
})

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

test("with the browser in English, Katip and its shortcuts are described in English", async ({
  background,
}) => {
  expect(await descriptionsIn(background)).toStrictEqual(
    descriptionsTranslatedBy(makeTranslator("en")),
  )
})

test("with the browser in Japanese, Katip and its shortcuts are described in Japanese", async () => {
  test.skip(process.platform === "darwin", "Chrome on macOS ignores --lang")
  const { context, close } = await launchWithExtension(EXTENSION_DIR, ["--lang=ja"])
  try {
    const background = await extensionWorkerOf(context)

    expect(await descriptionsIn(background)).toStrictEqual(
      descriptionsTranslatedBy(makeTranslator("ja")),
    )
  } finally {
    await close()
  }
})
