import { Result, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { applySettingsPatch, defaultSettings, IdleMinutes, Settings } from "./settings"

const decodeStored = Schema.decodeUnknownSync(Settings)
const encodeForStorage = Schema.encodeSync(Settings)

describe("既定値", () => {
  it("新しいタブを上に表示し、それ以外の機能は OFF、言語はブラウザに合わせる設定で始まる", () => {
    expect(defaultSettings).toStrictEqual({
      newTabsOnTop: true,
      showAllOpenTabsInCollapsedFolders: false,
      syncTabGroups: false,
      autoArchive: { enabled: false, idleMinutes: 360 },
      defaultSpaceId: null,
      locale: "auto",
      pageShortcuts: { copyUrl: false, copyMarkdownLink: false },
    })
  })
})

describe("保存値の読み込み", () => {
  it("保存したときの値がそのまま読める", () => {
    const saved: Settings = {
      newTabsOnTop: false,
      showAllOpenTabsInCollapsedFolders: true,
      syncTabGroups: true,
      autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(30) },
      defaultSpaceId: SpaceId.make("work"),
      locale: "zh",
      pageShortcuts: { copyUrl: true, copyMarkdownLink: false },
    }

    expect(decodeStored(encodeForStorage(saved))).toStrictEqual(saved)
  })

  it("何も保存されていなければ既定値になる", () => {
    expect(decodeStored(undefined)).toStrictEqual(defaultSettings)
  })

  it("保存値がオブジェクトでなければ既定値になる", () => {
    expect(decodeStored("corrupted")).toStrictEqual(defaultSettings)
  })

  it("欠けている項目だけが既定値で補われる", () => {
    const settings = decodeStored({ syncTabGroups: true })

    expect(settings).toStrictEqual({ ...defaultSettings, syncTabGroups: true })
  })

  it("型の合わない項目だけが既定値になり、他の項目は保存値のまま読める", () => {
    const settings = decodeStored({ newTabsOnTop: "yes", syncTabGroups: true })

    expect(settings).toStrictEqual({ ...defaultSettings, syncTabGroups: true })
  })

  it("自動アーカイブの片方の項目が壊れていても、もう片方は保存値のまま読める", () => {
    const settings = decodeStored({ autoArchive: { enabled: true, idleMinutes: 0 } })

    expect(settings.autoArchive).toStrictEqual({ enabled: true, idleMinutes: 360 })
  })

  it("自動アーカイブの設定がオブジェクトでなければ自動アーカイブだけが既定値になる", () => {
    const settings = decodeStored({ autoArchive: true, newTabsOnTop: false })

    expect(settings).toStrictEqual({ ...defaultSettings, newTabsOnTop: false })
  })

  it.each(["fr", "zh-CN", 1, null])(
    "対応していない言語 %j が保存されていると、言語だけがブラウザに合わせる設定になる",
    (locale) => {
      const settings = decodeStored({ locale, syncTabGroups: true })

      expect(settings).toStrictEqual({ ...defaultSettings, syncTabGroups: true, locale: "auto" })
    },
  )

  it("知らない項目が含まれていても読める", () => {
    const settings = decodeStored({ syncTabGroups: true, addedInFutureVersion: 1 })

    expect(settings).toStrictEqual({ ...defaultSettings, syncTabGroups: true })
  })
})

describe("IdleMinutes", () => {
  const decode = Schema.decodeUnknownResult(IdleMinutes)

  it("1 分を受け付ける", () => {
    expect(Result.isSuccess(decode(1))).toBe(true)
  })

  it.each([0, -5, 1.5, Number.NaN])("%s は受け付けない", (minutes) => {
    expect(Result.isFailure(decode(minutes))).toBe(true)
  })
})

describe("applySettingsPatch", () => {
  it("指定した項目だけが変わる", () => {
    const patched = applySettingsPatch(defaultSettings, { syncTabGroups: true })

    expect(patched).toStrictEqual({ ...defaultSettings, syncTabGroups: true })
  })

  it("自動アーカイブの片方だけを指定すると、もう片方は元の値のまま残る", () => {
    const current: Settings = {
      ...defaultSettings,
      autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(45) },
    }

    const patched = applySettingsPatch(current, { autoArchive: { enabled: false } })

    expect(patched.autoArchive).toStrictEqual({ enabled: false, idleMinutes: 45 })
  })

  it("ページ上のショートカットの片方だけを有効にすると、もう片方は元の値のまま残る", () => {
    const current: Settings = {
      ...defaultSettings,
      pageShortcuts: { copyUrl: true, copyMarkdownLink: false },
    }

    const patched = applySettingsPatch(current, { pageShortcuts: { copyMarkdownLink: true } })

    expect(patched.pageShortcuts).toStrictEqual({ copyUrl: true, copyMarkdownLink: true })
  })

  it("既定の Space を null に戻せる", () => {
    const current: Settings = { ...defaultSettings, defaultSpaceId: SpaceId.make("work") }

    const patched = applySettingsPatch(current, { defaultSpaceId: null })

    expect(patched.defaultSpaceId).toBeNull()
  })

  it("言語だけを変えられる", () => {
    const patched = applySettingsPatch(defaultSettings, { locale: "es" })

    expect(patched).toStrictEqual({ ...defaultSettings, locale: "es" })
  })

  it("空の変更では何も変わらない", () => {
    expect(applySettingsPatch(defaultSettings, {})).toStrictEqual(defaultSettings)
  })
})
