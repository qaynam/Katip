import { Result, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { applySettingsPatch, defaultSettings, IdleMinutes, Settings } from "./settings"

const decodeStored = Schema.decodeUnknownSync(Settings)
const encodeForStorage = Schema.encodeSync(Settings)

describe("defaults", () => {
  it("start with new tabs on top, update checks and bangs on, every other feature off, the browser's language and Spotlight at its normal size and place", () => {
    expect(defaultSettings).toStrictEqual({
      newTabsOnTop: true,
      showAllOpenTabsInCollapsedFolders: false,
      syncTabGroups: false,
      autoArchive: { enabled: false, idleMinutes: 360 },
      defaultSpaceId: null,
      locale: "auto",
      pageShortcuts: { copyUrl: false, copyMarkdownLink: false },
      checkForUpdates: true,
      bangs: true,
      spotlightSize: "Normal",
      spotlightPosition: { x: 0.5, y: 0.3 },
    })
  })
})

describe("reading stored settings", () => {
  it("reads back the values as they were saved", () => {
    const saved: Settings = {
      newTabsOnTop: false,
      showAllOpenTabsInCollapsedFolders: true,
      syncTabGroups: true,
      autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(30) },
      defaultSpaceId: SpaceId.make("work"),
      locale: "zh",
      pageShortcuts: { copyUrl: true, copyMarkdownLink: false },
      checkForUpdates: false,
      bangs: false,
      spotlightSize: "Compact",
      spotlightPosition: { x: 0.2, y: 0.6 },
    }

    expect(decodeStored(encodeForStorage(saved))).toStrictEqual(saved)
  })

  it("gives the defaults when nothing is stored", () => {
    expect(decodeStored(undefined)).toStrictEqual(defaultSettings)
  })

  it("gives the defaults when the stored value isn't an object", () => {
    expect(decodeStored("corrupted")).toStrictEqual(defaultSettings)
  })

  it("fills in only the missing fields with defaults", () => {
    const settings = decodeStored({ syncTabGroups: true })

    expect(settings).toStrictEqual({ ...defaultSettings, syncTabGroups: true })
  })

  it("resets only a field of the wrong type to its default, reading the others as stored", () => {
    const settings = decodeStored({ newTabsOnTop: "yes", syncTabGroups: true })

    expect(settings).toStrictEqual({ ...defaultSettings, syncTabGroups: true })
  })

  it("reads one auto archive field as stored even when the other is broken", () => {
    const settings = decodeStored({ autoArchive: { enabled: true, idleMinutes: 0 } })

    expect(settings.autoArchive).toStrictEqual({ enabled: true, idleMinutes: 360 })
  })

  it("resets only auto archive to its defaults when it isn't an object", () => {
    const settings = decodeStored({ autoArchive: true, newTabsOnTop: false })

    expect(settings).toStrictEqual({ ...defaultSettings, newTabsOnTop: false })
  })

  it("with a Spotlight position outside the window, opens Spotlight where it opens by default", () => {
    const settings = decodeStored({ spotlightPosition: { x: 1.5, y: 0.3 }, syncTabGroups: true })

    expect(settings).toStrictEqual({ ...defaultSettings, syncTabGroups: true })
  })

  it("with a Spotlight size this version doesn't know, opens Spotlight at its normal size", () => {
    const settings = decodeStored({ spotlightSize: "Huge", syncTabGroups: true })

    expect(settings).toStrictEqual({ ...defaultSettings, syncTabGroups: true })
  })

  it.each(["fr", "zh-CN", 1, null])(
    "with an unsupported language %j stored, only the language goes back to following the browser",
    (locale) => {
      const settings = decodeStored({ locale, syncTabGroups: true })

      expect(settings).toStrictEqual({ ...defaultSettings, syncTabGroups: true, locale: "auto" })
    },
  )

  it("reads settings that contain unknown fields", () => {
    const settings = decodeStored({ syncTabGroups: true, addedInFutureVersion: 1 })

    expect(settings).toStrictEqual({ ...defaultSettings, syncTabGroups: true })
  })
})

describe("IdleMinutes", () => {
  const decode = Schema.decodeUnknownResult(IdleMinutes)

  it("accepts 1 minute", () => {
    expect(Result.isSuccess(decode(1))).toBe(true)
  })

  it.each([0, -5, 1.5, Number.NaN])("rejects %s", (minutes) => {
    expect(Result.isFailure(decode(minutes))).toBe(true)
  })
})

describe("applySettingsPatch", () => {
  it("changes only the given fields", () => {
    const patched = applySettingsPatch(defaultSettings, { syncTabGroups: true })

    expect(patched).toStrictEqual({ ...defaultSettings, syncTabGroups: true })
  })

  it("giving one auto archive field keeps the other as it was", () => {
    const current: Settings = {
      ...defaultSettings,
      autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(45) },
    }

    const patched = applySettingsPatch(current, { autoArchive: { enabled: false } })

    expect(patched.autoArchive).toStrictEqual({ enabled: false, idleMinutes: 45 })
  })

  it("turning on one copy shortcut keeps the other as it was", () => {
    const current: Settings = {
      ...defaultSettings,
      pageShortcuts: { copyUrl: true, copyMarkdownLink: false },
    }

    const patched = applySettingsPatch(current, { pageShortcuts: { copyMarkdownLink: true } })

    expect(patched.pageShortcuts).toStrictEqual({ copyUrl: true, copyMarkdownLink: true })
  })

  it("can set the default Space back to null", () => {
    const current: Settings = { ...defaultSettings, defaultSpaceId: SpaceId.make("work") }

    const patched = applySettingsPatch(current, { defaultSpaceId: null })

    expect(patched.defaultSpaceId).toBeNull()
  })

  it("can change the language alone", () => {
    const patched = applySettingsPatch(defaultSettings, { locale: "es" })

    expect(patched).toStrictEqual({ ...defaultSettings, locale: "es" })
  })

  it("changes nothing with an empty patch", () => {
    expect(applySettingsPatch(defaultSettings, {})).toStrictEqual(defaultSettings)
  })
})
