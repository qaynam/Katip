import "@testing-library/svelte/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte"
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

const makeRuntime = (rejectedStorageOperation?: "get" | "set") => {
  const storage =
    rejectedStorageOperation === undefined
      ? FakeBrowser.layer
      : storageRejecting(rejectedStorageOperation).pipe(Layer.provide(FakeBrowser.layer))
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(SettingsRepository.layer.pipe(Layer.provide(storage)), FakeBrowser.layer),
  )
  runtimes.push(runtime)
  return runtime
}

interface RenderOptions {
  readonly saved?: SettingsPatch
  readonly browserLanguages?: ReadonlyArray<string>
  readonly rejectedStorageOperation?: "get" | "set"
}

const renderOptions = async ({
  saved = {},
  browserLanguages = ["ja-JP"],
  rejectedStorageOperation,
}: RenderOptions = {}) => {
  const runtime = makeRuntime(rejectedStorageOperation)
  const update = (patch: SettingsPatch) =>
    runtime.runPromise(SettingsRepository.use((repository) => repository.update(patch)))
  if (rejectedStorageOperation === undefined) await update(saved)
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
  await screen.findByRole("combobox")
  return rendered
}

const switchNamed = (name: string) => screen.getByRole<HTMLInputElement>("switch", { name })
const languagePopUp = () => screen.getByRole<HTMLSelectElement>("combobox")
const idleMinutesInput = () =>
  screen.getByRole<HTMLInputElement>("spinbutton", { name: "アーカイブするまでの時間" })

const commitIdleMinutes = async (text: string) => {
  const input = idleMinutesInput()
  await fireEvent.input(input, { target: { value: text } })
  await fireEvent.change(input)
}

const chooseLanguage = (value: string) => fireEvent.change(languagePopUp(), { target: { value } })

describe("表示", () => {
  it("保存されている設定が各項目に表示される", async () => {
    await renderLoaded({
      saved: {
        newTabsOnTop: false,
        syncTabGroups: true,
        autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(90) },
      },
    })

    expect(switchNamed("新しいタブを一番上に表示").checked).toBe(false)
    expect(switchNamed("閉じたフォルダでも開いているタブをすべて表示").checked).toBe(false)
    expect(switchNamed("Space を Chrome のタブグループと同期").checked).toBe(true)
    expect(switchNamed("使っていないタブを自動でアーカイブ").checked).toBe(true)
    expect(idleMinutesInput().value).toBe("90")
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

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Ajustes")
  })

  it("言語を指定していれば、ブラウザの言語によらずその言語で表示される", async () => {
    await renderLoaded({ saved: { locale: "zh" }, browserLanguages: ["ja-JP"] })

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("设置")
  })

  it("対応している言語がブラウザに無ければ英語で表示される", async () => {
    await renderLoaded({ browserLanguages: ["fr-FR"] })

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Settings")
  })

  it("自動の選択肢には、自動で選ばれる言語の名前が表示される", async () => {
    await renderLoaded({ saved: { locale: "ja" }, browserLanguages: ["es-MX"] })

    expect(screen.getByRole("option", { name: "自動（スペイン語）" })).toBeTruthy()
  })

  it("各言語の選択肢は、その言語自身の名前で表示される", async () => {
    await renderLoaded()

    expect(
      screen.getAllByRole<HTMLOptionElement>("option").map((option) => option.textContent),
    ).toStrictEqual(["自動（日本語）", "English", "日本語", "简体中文", "Español"])
  })

  it("言語を選ぶと、画面の文言がすぐにその言語に変わる", async () => {
    await renderLoaded()

    await chooseLanguage("en")

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Settings")
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

    await chooseLanguage("auto")

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("設定")
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

describe("自動アーカイブ", () => {
  it("OFF の間は時間の入力欄が無効になっている", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: false } } })

    expect(idleMinutesInput().disabled).toBe(true)
  })

  it("OFF にすると時間の入力欄が無効になる", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: true } } })

    await fireEvent.click(switchNamed("使っていないタブを自動でアーカイブ"))

    expect(idleMinutesInput().disabled).toBe(true)
  })

  it("ON にすると時間の入力欄が使えるようになる", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: false } } })

    await fireEvent.click(switchNamed("使っていないタブを自動でアーカイブ"))

    expect(idleMinutesInput().disabled).toBe(false)
  })

  it("時間を入力して確定すると保存される", async () => {
    const { readSaved } = await renderLoaded({ saved: { autoArchive: { enabled: true } } })

    await commitIdleMinutes("45")

    await waitFor(async () => {
      expect((await readSaved()).autoArchive.idleMinutes).toBe(45)
    })
  })

  it.each([
    ["0", "1 以上の整数で入力してください"],
    ["2.5", "1 以上の整数で入力してください"],
    ["", "時間を分単位で入力してください"],
  ])("「%s」を確定すると保存せずに理由を表示する", async (text, reason) => {
    const { readSaved } = await renderLoaded({
      saved: { autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(30) } },
    })

    await commitIdleMinutes(text)

    expect(await screen.findByText(reason)).toBeTruthy()
    expect(idleMinutesInput().getAttribute("aria-invalid")).toBe("true")
    expect((await readSaved()).autoArchive.idleMinutes).toBe(30)
  })

  it("不正な値のあとに正しい値を確定すると、理由が消えて保存される", async () => {
    const { readSaved } = await renderLoaded({ saved: { autoArchive: { enabled: true } } })
    await commitIdleMinutes("0")

    await commitIdleMinutes("120")

    await waitFor(async () => {
      expect((await readSaved()).autoArchive.idleMinutes).toBe(120)
    })
    expect(screen.queryByText("1 以上の整数で入力してください")).toBeNull()
  })

  it("理由を表示した後に他の画面で設定が変わり、入力欄が保存値に戻ると、理由も消える", async () => {
    const { saveElsewhere } = await renderLoaded({
      saved: { autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(30) } },
    })
    await commitIdleMinutes("0")

    await saveElsewhere({ syncTabGroups: true })

    await waitFor(() => {
      expect(idleMinutesInput().value).toBe("30")
    })
    expect(screen.queryByText("1 以上の整数で入力してください")).toBeNull()
    expect(idleMinutesInput().getAttribute("aria-invalid")).toBe("false")
  })

  it("増やすボタンを押すと、次の 5 分刻みの時間が保存される", async () => {
    const { readSaved } = await renderLoaded({
      saved: { autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(362) } },
    })

    await fireEvent.click(screen.getByRole("button", { name: "増やす" }))

    await waitFor(async () => {
      expect((await readSaved()).autoArchive.idleMinutes).toBe(365)
    })
    expect(idleMinutesInput().value).toBe("365")
  })

  it("減らすボタンを押すと、前の 5 分刻みの時間が保存される", async () => {
    const { readSaved } = await renderLoaded({
      saved: { autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(362) } },
    })

    await fireEvent.click(screen.getByRole("button", { name: "減らす" }))

    await waitFor(async () => {
      expect((await readSaved()).autoArchive.idleMinutes).toBe(360)
    })
  })

  it("時間の単位は件数に合った語形で表示される", async () => {
    await renderLoaded({
      saved: { autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(1) } },
      browserLanguages: ["en-US"],
    })

    expect(screen.getByText("minute")).toBeTruthy()
  })
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
