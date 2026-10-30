import "@testing-library/svelte/vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte"
import { Effect, Layer, ManagedRuntime, Option } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { IdleMinutes, SettingsRepository, type SettingsPatch } from "#modules/settings"
import { BrowserApiError, Storage, type StorageArea } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import App from "./App.svelte"

const VERSION = "1.2.3"

const runtimes: Array<{ dispose: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()))
})

const unavailable = (api: string) =>
  Effect.fail(new BrowserApiError({ api, cause: new Error("storage is unavailable") }))

const storageRejecting = (operation: "get" | "set") =>
  Layer.effect(
    Storage,
    Effect.gen(function* () {
      const { local, session, sync } = yield* Storage
      const reject = (area: StorageArea): StorageArea => ({
        ...area,
        [operation]: () => unavailable(`storage.${area.name}.${operation}`),
      })
      return Storage.of({ local: reject(local), session: reject(session), sync: reject(sync) })
    }),
  )

interface RenderOptions {
  readonly saved?: SettingsPatch
  readonly browserLanguages?: ReadonlyArray<string>
  readonly rejectedStorageOperation?: "get" | "set"
  readonly supportsSplitView?: boolean
}

const makeRuntime = ({
  rejectedStorageOperation,
  supportsSplitView = true,
}: Pick<RenderOptions, "rejectedStorageOperation" | "supportsSplitView">) => {
  const browser = FakeBrowser.layerWith({ supportsSplitView })
  const storage =
    rejectedStorageOperation === undefined
      ? browser
      : storageRejecting(rejectedStorageOperation).pipe(Layer.provide(browser))
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(SettingsRepository.layer.pipe(Layer.provide(storage)), browser),
  )
  runtimes.push(runtime)
  return runtime
}

const renderOptions = async ({
  saved = {},
  browserLanguages = ["ja-JP"],
  ...runtimeOptions
}: RenderOptions = {}) => {
  const runtime = makeRuntime(runtimeOptions)
  const update = (patch: SettingsPatch) =>
    runtime.runPromise(SettingsRepository.use((repository) => repository.update(patch)))
  if (runtimeOptions.rejectedStorageOperation === undefined) await update(saved)
  render(App, { props: { runtime, version: VERSION, browserLanguages } })
  return {
    readSaved: () => runtime.runPromise(SettingsRepository.use((repository) => repository.get)),
    saveElsewhere: update,
    browser: <A>(use: (browser: FakeBrowser["Service"]) => Effect.Effect<A, unknown>) =>
      runtime.runPromise(FakeBrowser.use(use)),
  }
}

const renderLoaded = async (options: RenderOptions = {}) => {
  const rendered = await renderOptions(options)
  await screen.findAllByRole("switch")
  return rendered
}

const switchNamed = (name: string) => screen.getByRole<HTMLInputElement>("switch", { name })
const popUpNamed = (name: string) => screen.getByRole<HTMLSelectElement>("combobox", { name })
const optionLabelsOf = (popUp: HTMLSelectElement) =>
  within(popUp)
    .getAllByRole<HTMLOptionElement>("option")
    .map((option) => option.textContent)
const selectedLabelOf = (popUp: HTMLSelectElement) => popUp.selectedOptions[0]?.textContent

const languagePopUp = (name = "言語") => popUpNamed(name)
const chooseLanguage = (value: string, popUpName?: string) =>
  fireEvent.change(languagePopUp(popUpName), { target: { value } })

const idleTimePopUp = () => popUpNamed("アーカイブするまでの時間")
const chooseIdleMinutes = (minutes: number) =>
  fireEvent.change(idleTimePopUp(), { target: { value: String(minutes) } })

const heading = () => screen.getByRole("heading", { level: 1 }).textContent

describe("表示", () => {
  it("保存されている設定が各項目に表示される", async () => {
    await renderLoaded({
      saved: {
        newTabsOnTop: false,
        syncTabGroups: true,
        autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(720) },
      },
    })

    expect(switchNamed("新しいタブを一番上に表示").checked).toBe(false)
    expect(switchNamed("閉じたフォルダでも開いているタブをすべて表示").checked).toBe(false)
    expect(switchNamed("Space を Chrome のタブグループと同期").checked).toBe(true)
    expect(switchNamed("使っていないタブを自動でアーカイブ").checked).toBe(true)
    expect(selectedLabelOf(idleTimePopUp())).toBe("12 時間")
  })

  it("他の画面で設定が変わると、表示もその値に変わる", async () => {
    const { saveElsewhere } = await renderLoaded()

    await saveElsewhere({ syncTabGroups: true })

    await waitFor(() => {
      expect(switchNamed("Space を Chrome のタブグループと同期").checked).toBe(true)
    })
  })

  it("拡張機能のバージョンが表示される", async () => {
    await renderLoaded()

    expect(screen.getByText(VERSION)).toBeTruthy()
  })
})

describe("言語", () => {
  it("自動のときは、ブラウザが優先する言語で表示される", async () => {
    await renderLoaded({ browserLanguages: ["fr-FR", "es-MX"] })

    expect(heading()).toBe("Ajustes")
  })

  it("言語を指定していれば、ブラウザの言語によらずその言語で表示される", async () => {
    await renderLoaded({ saved: { locale: "zh" }, browserLanguages: ["ja-JP"] })

    expect(heading()).toBe("设置")
  })

  it("対応している言語がブラウザに無ければ英語で表示される", async () => {
    await renderLoaded({ browserLanguages: ["fr-FR"] })

    expect(heading()).toBe("Settings")
  })

  it("自動の選択肢には、自動で選ばれる言語の名前が表示される", async () => {
    await renderLoaded({ saved: { locale: "ja" }, browserLanguages: ["es-MX"] })

    expect(optionLabelsOf(languagePopUp())).toContain("自動（スペイン語）")
  })

  it("各言語の選択肢は、その言語自身の名前で表示される", async () => {
    await renderLoaded()

    expect(optionLabelsOf(languagePopUp())).toStrictEqual([
      "自動（日本語）",
      "English",
      "日本語",
      "简体中文",
      "Español",
    ])
  })

  it("言語を選ぶと、画面の文言がすぐにその言語に変わる", async () => {
    await renderLoaded()

    await chooseLanguage("en")

    expect(heading()).toBe("Settings")
    expect(switchNamed("Show new tabs at the top")).toBeTruthy()
  })

  it("選んだ言語が保存される", async () => {
    const { readSaved } = await renderLoaded()

    await chooseLanguage("es")

    await waitFor(async () => {
      expect((await readSaved()).locale).toBe("es")
    })
  })

  it("自動に戻すと、ブラウザの言語で表示され、自動が保存される", async () => {
    const { readSaved } = await renderLoaded({
      saved: { locale: "en" },
      browserLanguages: ["ja-JP"],
    })

    await chooseLanguage("auto", "Language")

    expect(heading()).toBe("設定")
    await waitFor(async () => {
      expect((await readSaved()).locale).toBe("auto")
    })
  })

  it("文書の言語が、表示している言語になる", async () => {
    await renderLoaded()

    await chooseLanguage("zh")

    expect(document.documentElement.lang).toBe("zh-Hans")
  })
})

describe("読み込みの失敗", () => {
  it("設定を読み込めないと、ブラウザの言語で再読み込みを促す", async () => {
    await renderOptions({ rejectedStorageOperation: "get" })

    expect(
      await screen.findByText("設定を読み込めませんでした。ページを再読み込みしてください。"),
    ).toBeTruthy()
  })
})

describe("スイッチ", () => {
  it("切り替えるとすぐに保存される", async () => {
    const { readSaved } = await renderLoaded()

    await fireEvent.click(switchNamed("閉じたフォルダでも開いているタブをすべて表示"))

    await waitFor(async () => {
      expect((await readSaved()).showAllOpenTabsInCollapsedFolders).toBe(true)
    })
  })

  it("保存すると「保存しました」と知らせる", async () => {
    await renderLoaded()

    await fireEvent.click(switchNamed("Space を Chrome のタブグループと同期"))

    expect(await screen.findByText("保存しました")).toBeTruthy()
  })

  it("保存に失敗すると、スイッチが元の状態に戻り、失敗を知らせる", async () => {
    await renderOptions({ rejectedStorageOperation: "set" })
    const sync = await screen.findByRole<HTMLInputElement>("switch", {
      name: "Space を Chrome のタブグループと同期",
    })

    await fireEvent.click(sync)

    expect(
      await screen.findByText("保存できませんでした。少し待ってから、もう一度変更してください。"),
    ).toBeTruthy()
    expect(sync.checked).toBe(false)
  })
})

describe("分割ビュー", () => {
  it("分割ビューに対応しているブラウザでは、使えると表示される", async () => {
    await renderLoaded({ supportsSplitView: true })

    expect(screen.getByText("使えます")).toBeTruthy()
  })

  it("分割ビューに対応していないブラウザでは、使えないことと必要な Chrome の版が表示される", async () => {
    await renderLoaded({ supportsSplitView: false })

    expect(screen.getByText("このブラウザでは使えません（Chrome 155 以降が必要）")).toBeTruthy()
    expect(screen.queryByText("使えます")).toBeNull()
  })
})

describe("自動アーカイブ", () => {
  it("OFF の間は時間を選べない", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: false } } })

    expect(idleTimePopUp().disabled).toBe(true)
  })

  it("OFF にすると時間を選べなくなる", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: true } } })

    await fireEvent.click(switchNamed("使っていないタブを自動でアーカイブ"))

    expect(idleTimePopUp().disabled).toBe(true)
  })

  it("ON にすると時間を選べるようになる", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: false } } })

    await fireEvent.click(switchNamed("使っていないタブを自動でアーカイブ"))

    expect(idleTimePopUp().disabled).toBe(false)
  })

  it("時間を選ぶと、選んだ分数で保存される", async () => {
    const { readSaved } = await renderLoaded({ saved: { autoArchive: { enabled: true } } })

    await chooseIdleMinutes(3 * 24 * 60)

    await waitFor(async () => {
      expect((await readSaved()).autoArchive.idleMinutes).toBe(3 * 24 * 60)
    })
    expect(selectedLabelOf(idleTimePopUp())).toBe("3 日")
  })

  it("時間の選択肢は、短い順に、割り切れる最も大きい単位で表示される", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: true } } })

    expect(optionLabelsOf(idleTimePopUp())).toStrictEqual([
      "30 分",
      "1 時間",
      "3 時間",
      "6 時間",
      "12 時間",
      "1 日",
      "3 日",
      "1 週間",
    ])
  })

  it("選択肢に無い保存値も、選択中として表示される", async () => {
    await renderLoaded({
      saved: { autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(90) } },
    })

    expect(selectedLabelOf(idleTimePopUp())).toBe("90 分")
    expect(optionLabelsOf(idleTimePopUp())).toContain("90 分")
  })

  it.each([
    ["en-US", "Archive after", ["30 minutes", "1 hour", "6 hours", "1 day", "1 week"]],
    ["zh-CN", "闲置多久后归档", ["30 分钟", "1 小时", "6 小时", "1 天", "1 周"]],
    ["es-ES", "Archivar tras", ["30 minutos", "1 hora", "6 horas", "1 día", "1 semana"]],
  ])(
    "%s では、時間がその言語の単位と語形で表示される",
    async (browserLanguage, popUpName, expected) => {
      await renderLoaded({
        saved: { autoArchive: { enabled: true } },
        browserLanguages: [browserLanguage],
      })

      expect(optionLabelsOf(popUpNamed(popUpName))).toEqual(expect.arrayContaining(expected))
    },
  )
})

describe("キーボードショートカット", () => {
  it("変更ボタンを押すと、Chrome のショートカット設定が新しいタブで開く", async () => {
    const { browser } = await renderLoaded()
    await browser((fake) => fake.seedWindow({ tabs: [{}] }))

    await fireEvent.click(screen.getByRole("button", { name: "Chrome で変更" }))

    await waitFor(async () => {
      const { tabs } = await browser((fake) => fake.snapshot)
      expect(
        tabs.filter((tab) => Option.contains(tab.url, "chrome://extensions/shortcuts")),
      ).toHaveLength(1)
    })
  })

  it("ショートカット設定を開けなければ、そのことを知らせる", async () => {
    const { browser } = await renderLoaded()
    await browser((fake) => fake.seedWindow({ tabs: [{}] }))
    await browser((fake) => fake.failNext("tabs.create"))

    await fireEvent.click(screen.getByRole("button", { name: "Chrome で変更" }))

    expect(await screen.findByText("Chrome のショートカット設定を開けませんでした。")).toBeTruthy()
  })
})
