import { Locale, makeTranslator, type MessageKey } from "#modules/i18n"

type BuildMode = "development" | "production"

type ManifestMessageKey = Extract<MessageKey, `manifest.${string}`>

/** The `messages.json` of one language, as Chrome reads it from `_locales/`. */
export type ChromeLocaleMessages = Readonly<Record<string, { readonly message: string }>>

// Chrome names Simplified Chinese zh_CN; a plain zh directory would also be picked for Traditional
// Chinese, which Katip has no translation for
const localeDirectories: { readonly [L in Locale]: string } = {
  en: "en",
  ja: "ja",
  zh: "zh_CN",
  es: "es",
}

// Chrome allows only ASCII letters, digits and underscores in message names
const messageNameOf = (key: ManifestMessageKey): string => key.replaceAll(".", "_")

const localized = (key: ManifestMessageKey): string => `__MSG_${messageNameOf(key)}__`

// This public key fixes the extension ID to hggfdjnidgfpigakapgkgolnjemijaed
const DEVELOPMENT_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1NcVH3QU/wS6acXcUvFkkqNLkaAEPQh6F83b3us2DoqCNLlsArSL2k9AEocUbX3Pzzz9Zr6kWbwesAVcrsvsnn0IO206pbboppASdYB0N5beGkug7aA9ZkzIck2s4INm5U5Dd/NdNLiTjtXz7yfozehxBuYanzovkulYwVbUXvc8437BZAasznkP2CArE4yZC/Agwmaoz/W0l7V1MEbsR0skCSOJKcsGmhZUqlfAh5uTIK5Uvk4IYIuRNJjWKcHyH3qbLtrm8ELMVfNSvEdnSzm2QCf93dqHahEWhKZcMokEJQpnG1l1asuxNamSAOiPc325D1Ca2bXyTKNdornDyQIDAQAB"

interface CommandDeclaration {
  readonly suggested_key?: { readonly default: string; readonly mac?: string }
  readonly description: ManifestMessageKey
}

const commands = {
  _execute_action: {
    suggested_key: { default: "Alt+S", mac: "Command+MacCtrl+S" },
    description: "manifest.command.openSidePanel",
  },
  "open-spotlight": {
    suggested_key: { default: "Alt+T" },
    description: "manifest.command.openSpotlight",
  },
  // Not ⌘⇧C, Ctrl+Shift+C or Alt+Shift+C: Chrome keeps them for itself and silently leaves a
  // suggested key it uses unassigned. Not ⌘⌃⇧C either: Chrome refuses to load a manifest that
  // suggests three modifiers. People who want ⌘⇧C can still assign it themselves
  "copy-current-url": {
    suggested_key: { default: "Alt+C", mac: "MacCtrl+Shift+C" },
    description: "manifest.command.copyUrl",
  },
  "copy-current-url-as-markdown": {
    suggested_key: { default: "Alt+M", mac: "MacCtrl+Shift+M" },
    description: "manifest.command.copyMarkdownLink",
  },
  // Chrome refuses to load a manifest that suggests keys for more than 4 commands, so these are
  // left for people to assign themselves
  "quick-pin-toggle": { description: "manifest.command.togglePin" },
  "next-tab-in-space": { description: "manifest.command.nextTabInSpace" },
  "previous-tab-in-space": { description: "manifest.command.previousTabInSpace" },
} as const satisfies Readonly<Record<string, CommandDeclaration>>

const DESCRIPTION: ManifestMessageKey = "manifest.description"

const messageKeys: ReadonlyArray<ManifestMessageKey> = [
  DESCRIPTION,
  ...Object.values(commands).map(({ description }) => description),
]

// Chrome won't load a version with semver pre-release or build metadata. Dropping that part
// instead could ship two different builds under the same version, so no manifest is made
const isChromeExtensionVersion = (version: string): boolean => {
  const parts = version.split(".")
  return (
    parts.length <= 4 && parts.every((part) => /^(0|[1-9]\d*)$/.test(part) && Number(part) <= 65535)
  )
}

/**
 * The manifest. Its description and command descriptions are `__MSG_…__` placeholders that Chrome
 * fills in from {@link buildLocaleMessages}, so the extension also needs those files.
 *
 * @throws Error when `version` isn't a version Chrome loads: one to four dot-separated integers
 * from 0 to 65535.
 */
export const buildManifest = (mode: BuildMode, version: string): chrome.runtime.ManifestV3 => {
  if (!isChromeExtensionVersion(version)) {
    throw new Error(
      `Version "${version}" can't be an extension version: it must be one to four dot-separated integers from 0 to 65535`,
    )
  }
  return manifestOf(mode, version)
}

/**
 * The `messages.json` for each language Katip is translated into, keyed by its directory name
 * under `_locales/`.
 */
export const buildLocaleMessages = (): Readonly<Record<string, ChromeLocaleMessages>> =>
  Object.fromEntries(
    Locale.literals.map((locale) => {
      const translator = makeTranslator(locale)
      return [
        localeDirectories[locale],
        Object.fromEntries(
          messageKeys.map((key) => [messageNameOf(key), { message: translator.t(key) }]),
        ),
      ]
    }),
  )

const manifestOf = (mode: BuildMode, version: string): chrome.runtime.ManifestV3 => ({
  manifest_version: 3,
  name: mode === "development" ? "Katip (dev)" : "Katip",
  version,
  default_locale: localeDirectories.en,
  description: localized(DESCRIPTION),
  homepage_url: "https://github.com/qaynam/Katip",
  minimum_chrome_version: "120",
  permissions: [
    "tabs",
    "tabGroups",
    "sidePanel",
    "storage",
    "bookmarks",
    "alarms",
    "favicon",
    "offscreen",
    "clipboardWrite",
    "search",
    "scripting",
    // Lets a script into the tab a keyboard shortcut ran on, for that moment only, so the copy
    // notice can show on the page without asking for access to every site
    "activeTab",
  ],
  // For searching browsing history in Spotlight. Asked for only when turned on in the settings
  optional_permissions: ["history"],
  // Live folder sources. Asked for only when a live folder needs one, so people who don't use
  // live folders are never asked
  optional_host_permissions: [
    "https://mail.google.com/*",
    "https://github.com/*",
    "https://api.github.com/*",
  ],
  side_panel: { default_path: "sidepanel/index.html" },
  action: { default_title: "Katip" },
  background: { service_worker: "background.js", type: "module" },
  options_page: "options/index.html",
  commands: Object.fromEntries(
    Object.entries(commands).map(([name, { description, ...command }]) => [
      name,
      { ...command, description: localized(description) },
    ]),
  ),
  // Browser automation tools can't open extension pages, so development builds let a test page on
  // localhost connect to the background. The public key keeps the ID to connect to the same
  // wherever the build is loaded from (its private key is not kept anywhere)
  ...(mode === "development" && {
    externally_connectable: { matches: ["http://localhost/*"] },
    key: DEVELOPMENT_PUBLIC_KEY,
  }),
})
