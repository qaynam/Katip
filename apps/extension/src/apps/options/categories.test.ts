import { describe, expect, it } from "vitest"
import { historySearchSettingsUrl } from "#protocol"
import { buildManifest } from "../manifest"
import { categoryOfFragment } from "./categories"

const ORIGIN = "chrome-extension://katip-test/"

describe("the link to the history search setting", () => {
  it("opens the settings page the manifest names", () => {
    const settingsPage = `${ORIGIN}${buildManifest("production", "1.0.0").options_page}`

    expect(historySearchSettingsUrl(ORIGIN).startsWith(`${settingsPage}#`)).toBe(true)
  })

  it("opens the settings at the Spotlight category, which holds history search", () => {
    expect(categoryOfFragment(new URL(historySearchSettingsUrl(ORIGIN)).hash)).toBe("Spotlight")
  })
})
