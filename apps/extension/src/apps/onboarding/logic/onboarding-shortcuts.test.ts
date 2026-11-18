import { describe, expect, it } from "vitest"
import { browserKeyToSuggest, ONBOARDING_SHORTCUTS } from "./onboarding-shortcuts"

const shortcutFor = (command: string) => {
  const found = ONBOARDING_SHORTCUTS.find((shortcut) => shortcut.command === command)
  if (found === undefined) throw new Error(`the shortcuts step doesn't list ${command}`)
  return found
}

describe("browserKeyToSuggest", () => {
  it("suggests the address bar's ⌘L for editing the address on a Mac", () => {
    expect(
      browserKeyToSuggest(shortcutFor("edit-current-url"), { _tag: "NotSet" }, true),
    ).toStrictEqual({
      key: "⌘L",
      hint: "onboarding.shortcuts.addressBarKey",
    })
  })

  it("suggests Ctrl+T for the Command Palette on other systems, in place of a new tab", () => {
    expect(
      browserKeyToSuggest(shortcutFor("open-spotlight"), { _tag: "Assigned", key: "Alt+T" }, false),
    ).toStrictEqual({ key: "Ctrl+T", hint: "onboarding.shortcuts.newTabKey" })
  })

  it("suggests nothing once the command has the key", () => {
    expect(
      browserKeyToSuggest(shortcutFor("edit-current-url"), { _tag: "Assigned", key: "⌘L" }, true),
    ).toBeNull()
  })

  it("suggests nothing for a command the browser has no key worth giving up for", () => {
    expect(
      browserKeyToSuggest(shortcutFor("copy-current-url"), { _tag: "NotSet" }, true),
    ).toBeNull()
  })
})
