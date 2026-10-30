import "@testing-library/svelte/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte"
import { Effect, Layer, ManagedRuntime } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { IdleMinutes, SettingsRepository, type SettingsPatch } from "#modules/settings"
import { BrowserApiError, Storage, type StorageArea } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import App from "./App.svelte"
import type { OptionsRuntime } from "./options-runtime"

const runtimes: Array<OptionsRuntime> = []

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
  ).pipe(Layer.provide(FakeBrowser.layer))

const makeRuntime = (storage: Layer.Layer<Storage>): OptionsRuntime => {
  const runtime = ManagedRuntime.make(SettingsRepository.layer.pipe(Layer.provide(storage)))
  runtimes.push(runtime)
  return runtime
}

const renderOptions = async (saved: SettingsPatch = {}) => {
  const runtime = makeRuntime(FakeBrowser.layer)
  const update = (patch: SettingsPatch) =>
    runtime.runPromise(SettingsRepository.use((repository) => repository.update(patch)))
  await update(saved)
  render(App, { props: { runtime } })
  await screen.findByRole("switch", { name: "新しいタブを一時タブの一番上に表示する" })
  return {
    readSaved: () => runtime.runPromise(SettingsRepository.use((repository) => repository.get)),
    saveElsewhere: update,
  }
}

const switchNamed = (name: string) => screen.getByRole<HTMLInputElement>("switch", { name })
const idleMinutesInput = () =>
  screen.getByRole<HTMLInputElement>("spinbutton", { name: "アーカイブするまでの時間" })

const commitIdleMinutes = async (text: string) => {
  const input = idleMinutesInput()
  await fireEvent.input(input, { target: { value: text } })
  await fireEvent.change(input)
}

describe("表示", () => {
  it("保存されている設定が各項目に表示される", async () => {
    await renderOptions({
      newTabsOnTop: false,
      syncTabGroups: true,
      autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(90) },
    })

    expect(switchNamed("新しいタブを一時タブの一番上に表示する").checked).toBe(false)
    expect(switchNamed("閉じたフォルダでも、開いているタブをすべて表示する").checked).toBe(false)
    expect(switchNamed("Space を Chrome のタブグループと同期する").checked).toBe(true)
    expect(switchNamed("使っていない一時タブを自動でアーカイブする").checked).toBe(true)
    expect(idleMinutesInput().value).toBe("90")
  })

  it("他の画面で設定が変わると、表示もその値に変わる", async () => {
    const { saveElsewhere } = await renderOptions()

    await saveElsewhere({ syncTabGroups: true })

    await waitFor(() => {
      expect(switchNamed("Space を Chrome のタブグループと同期する").checked).toBe(true)
    })
  })
})

describe("読み込みの失敗", () => {
  it("設定を読み込めないと、再読み込みを促す", async () => {
    render(App, { props: { runtime: makeRuntime(storageRejecting("get")) } })

    expect(
      await screen.findByText("設定を読み込めませんでした。ページを再読み込みしてください。"),
    ).toBeTruthy()
  })
})

describe("スイッチ", () => {
  it("切り替えるとすぐに保存される", async () => {
    const { readSaved } = await renderOptions()

    await fireEvent.click(switchNamed("閉じたフォルダでも、開いているタブをすべて表示する"))

    await waitFor(async () => {
      expect((await readSaved()).showAllOpenTabsInCollapsedFolders).toBe(true)
    })
  })

  it("保存すると「保存しました」と知らせる", async () => {
    await renderOptions()

    await fireEvent.click(switchNamed("Space を Chrome のタブグループと同期する"))

    expect(await screen.findByText("保存しました")).toBeTruthy()
  })

  it("保存に失敗すると、スイッチが元の状態に戻り、失敗を知らせる", async () => {
    render(App, { props: { runtime: makeRuntime(storageRejecting("set")) } })
    const sync = await screen.findByRole<HTMLInputElement>("switch", {
      name: "Space を Chrome のタブグループと同期する",
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
    await renderOptions({ autoArchive: { enabled: false } })

    expect(idleMinutesInput().disabled).toBe(true)
  })

  it("OFF にすると時間の入力欄が無効になる", async () => {
    await renderOptions({ autoArchive: { enabled: true } })

    await fireEvent.click(switchNamed("使っていない一時タブを自動でアーカイブする"))

    expect(idleMinutesInput().disabled).toBe(true)
  })

  it("ON にすると時間の入力欄が使えるようになる", async () => {
    await renderOptions({ autoArchive: { enabled: false } })

    await fireEvent.click(switchNamed("使っていない一時タブを自動でアーカイブする"))

    expect(idleMinutesInput().disabled).toBe(false)
  })

  it("時間を入力して確定すると保存される", async () => {
    const { readSaved } = await renderOptions({ autoArchive: { enabled: true } })

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
    const { readSaved } = await renderOptions({
      autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(30) },
    })

    await commitIdleMinutes(text)

    expect(await screen.findByText(reason)).toBeTruthy()
    expect(idleMinutesInput().getAttribute("aria-invalid")).toBe("true")
    expect((await readSaved()).autoArchive.idleMinutes).toBe(30)
  })

  it("不正な値のあとに正しい値を確定すると、理由が消えて保存される", async () => {
    const { readSaved } = await renderOptions({ autoArchive: { enabled: true } })
    await commitIdleMinutes("0")

    await commitIdleMinutes("120")

    await waitFor(async () => {
      expect((await readSaved()).autoArchive.idleMinutes).toBe(120)
    })
    expect(screen.queryByText("1 以上の整数で入力してください")).toBeNull()
  })
})
