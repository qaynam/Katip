import "@testing-library/svelte/vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte"
import { Effect, Layer, ManagedRuntime, Option, Queue, Schema, Stream } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { IdleMinutes, SettingsRepository, type SettingsPatch } from "#modules/settings"
import { BrowserApiError, BrowserEvents, Storage, type StorageArea } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { KeyboardShortcuts } from "#platform/keyboard-shortcuts"
import { EXPORT_PORT_NAME, ExportServerMessage } from "#protocol"
import App from "./App.svelte"
import { FakeFileDownloads } from "./testing/fake-file-downloads"
import { FakeOptionalPermissions } from "./testing/fake-optional-permissions"

const VERSION = "1.2.3"
const REPOSITORY_URL = "https://git.example/katip"

/** Keys as macOS reports the defaults the manifest suggests. */
const DEFAULT_KEYS: Readonly<Record<string, string>> = {
  _execute_action: "⌃⌘S",
  "open-spotlight": "⌥T",
  "copy-current-url": "⇧⌘C",
  "copy-current-url-as-markdown": "⌃⇧⌘C",
}

const runtimes: Array<{ dispose: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()))
  history.replaceState(null, "", location.pathname)
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

/** What the browser reports as assigned keys; `Unavailable` makes reading them fail. */
type AssignedKeys = Readonly<Record<string, string>> | "Unavailable"

const keyboardShortcutsReporting = (browserKeys: { current: AssignedKeys }) =>
  Layer.succeed(
    KeyboardShortcuts,
    KeyboardShortcuts.of({
      assigned: Effect.suspend(() =>
        browserKeys.current === "Unavailable"
          ? Effect.fail(new BrowserApiError({ api: "commands.getAll", cause: new Error("gone") }))
          : Effect.succeed(new Map(Object.entries(browserKeys.current))),
      ),
      isMac: Effect.succeed(true),
    }),
  )

/** The background's answer to an export request. `Disconnect` hangs up without answering. */
type ExportAnswer = ExportServerMessage | { readonly _tag: "Disconnect" }

const encodeExportAnswer = Schema.encodeSync(ExportServerMessage)

const exportServerAnswering = (answers: Queue.Queue<ExportAnswer>) =>
  Layer.effectDiscard(
    BrowserEvents.use((events) =>
      events.connections.pipe(
        Stream.filter((port) => port.name === EXPORT_PORT_NAME),
        Stream.runForEach((port) =>
          Effect.gen(function* () {
            yield* Stream.runHead(port.messages)
            const answer = yield* Queue.take(answers)
            yield* answer._tag === "Disconnect"
              ? port.disconnect
              : Effect.ignore(port.post(encodeExportAnswer(answer)))
          }),
        ),
        Effect.forkScoped,
      ),
    ),
  )

interface RenderOptions {
  readonly saved?: SettingsPatch
  readonly browserLanguages?: ReadonlyArray<string>
  readonly rejectedStorageOperation?: "get" | "set"
  readonly supportsSplitView?: boolean
  readonly assignedKeys?: AssignedKeys
}

const makeRuntime = (
  {
    rejectedStorageOperation,
    supportsSplitView = true,
  }: Pick<RenderOptions, "rejectedStorageOperation" | "supportsSplitView">,
  browserKeys: { current: AssignedKeys },
  exportAnswers: Queue.Queue<ExportAnswer>,
) => {
  const browser = FakeBrowser.layerWith({ supportsSplitView })
  const storage =
    rejectedStorageOperation === undefined
      ? browser
      : storageRejecting(rejectedStorageOperation).pipe(Layer.provide(browser))
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      SettingsRepository.layer.pipe(Layer.provide(storage)),
      browser,
      FakeOptionalPermissions.layer,
      FakeFileDownloads.layer,
      keyboardShortcutsReporting(browserKeys),
      exportServerAnswering(exportAnswers).pipe(Layer.provide(browser)),
    ),
  )
  runtimes.push(runtime)
  return runtime
}

const renderOptions = async ({
  saved = {},
  browserLanguages = ["ja-JP"],
  assignedKeys = DEFAULT_KEYS,
  ...runtimeOptions
}: RenderOptions = {}) => {
  const exportAnswers = Effect.runSync(Queue.unbounded<ExportAnswer>())
  const browserKeys = { current: assignedKeys }
  const runtime = makeRuntime(runtimeOptions, browserKeys, exportAnswers)
  const update = (patch: SettingsPatch) =>
    runtime.runPromise(SettingsRepository.use((repository) => repository.update(patch)))
  if (runtimeOptions.rejectedStorageOperation === undefined) await update(saved)
  render(App, {
    props: { runtime, version: VERSION, repositoryUrl: REPOSITORY_URL, browserLanguages },
  })
  return {
    readSaved: () => runtime.runPromise(SettingsRepository.use((repository) => repository.get)),
    saveElsewhere: update,
    browser: <A>(use: (browser: FakeBrowser["Service"]) => Effect.Effect<A, unknown>) =>
      runtime.runPromise(FakeBrowser.use(use)),
    permissions: <A>(
      use: (permissions: FakeOptionalPermissions["Service"]) => Effect.Effect<A, unknown>,
    ) => runtime.runPromise(FakeOptionalPermissions.use(use)),
    reassignKeysInBrowser: (keys: AssignedKeys) => {
      browserKeys.current = keys
    },
    answerExport: (answer: ExportAnswer) => Effect.runSync(Queue.offer(exportAnswers, answer)),
    downloaded: () => runtime.runPromise(FakeFileDownloads.use((downloads) => downloads.saved)),
  }
}

/** Renders the page and waits for the saved settings to show in the General category. */
const renderLoaded = async (options: RenderOptions = {}) => {
  const rendered = await renderOptions(options)
  await screen.findByRole("combobox")
  return rendered
}

const categoryTab = (name: string) => screen.getByRole<HTMLButtonElement>("tab", { name })
const openCategory = (name: string) => fireEvent.click(categoryTab(name))
const selectedCategory = () => screen.getByRole("tab", { selected: true }).textContent?.trim()

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

/** The keys shown beside a command, as one string. */
// Not by role and name: ARIA forbids naming terms and definitions, so the command's text locates
// its term and the definition that follows it
const keysShownFor = (command: string) =>
  screen
    .getByText(command, { selector: "dt, dt label" })
    .closest("dt")
    ?.nextElementSibling?.textContent?.trim()

describe("categories", () => {
  it("opens on General, which holds the language setting", async () => {
    await renderLoaded()

    expect(selectedCategory()).toBe("一般")
    expect(languagePopUp()).toBeTruthy()
  })

  it("lists every category in order", async () => {
    await renderLoaded()

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.trim())).toStrictEqual([
      "一般",
      "タブ",
      "アーカイブ",
      "Spotlight",
      "ショートカット",
      "データ",
    ])
  })

  it("choosing a category shows its settings in place of the previous category's", async () => {
    await renderLoaded()

    await openCategory("タブ")

    expect(selectedCategory()).toBe("タブ")
    expect(switchNamed("新しいタブを一番上に表示")).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "言語" })).toBeNull()
  })

  it("names the shown settings after the chosen category", async () => {
    await renderLoaded()

    await openCategory("アーカイブ")

    expect(screen.getByRole("tabpanel", { name: "アーカイブ" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("アーカイブ")
  })

  it("arrow keys move to the next or previous category and focus it, wrapping past the ends", async () => {
    await renderLoaded()
    categoryTab("一般").focus()

    await fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowDown" })
    const afterDown = selectedCategory()
    await fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowUp" })
    await fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowUp" })

    expect([afterDown, selectedCategory(), document.activeElement?.textContent?.trim()]).toEqual([
      "タブ",
      "データ",
      "データ",
    ])
  })

  it("Home and End move to the first and last category", async () => {
    await renderLoaded()
    categoryTab("一般").focus()

    await fireEvent.keyDown(document.activeElement ?? document.body, { key: "End" })
    const afterEnd = selectedCategory()
    await fireEvent.keyDown(document.activeElement ?? document.body, { key: "Home" })

    expect([afterEnd, selectedCategory()]).toEqual(["データ", "一般"])
  })

  it("only the chosen category is reachable with Tab; the others are reached with arrow keys", async () => {
    await renderLoaded()

    expect(screen.getAllByRole("tab").map((tab) => tab.tabIndex)).toStrictEqual([
      0, -1, -1, -1, -1, -1,
    ])
  })

  it("puts the chosen category in the URL fragment, without adding a history entry", async () => {
    await renderLoaded()
    const entriesBefore = history.length

    await openCategory("ショートカット")

    expect([location.hash, history.length]).toStrictEqual(["#shortcuts", entriesBefore])
  })

  it("changing the URL fragment opens the category it names", async () => {
    await renderLoaded()

    location.hash = "#data"

    expect(await screen.findByRole("button", { name: "書き出す" })).toBeTruthy()
    expect(selectedCategory()).toBe("データ")
  })

  it("opens on the category the URL fragment names", async () => {
    history.replaceState(null, "", "#archive")

    await renderOptions()

    expect(
      await screen.findByRole("switch", { name: "使っていないタブを自動でアーカイブ" }),
    ).toBeTruthy()
    expect(selectedCategory()).toBe("アーカイブ")
  })
})

describe("display", () => {
  it("shows the saved settings in each control", async () => {
    await renderLoaded({
      saved: {
        newTabsOnTop: false,
        syncTabGroups: true,
        autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(720) },
      },
    })

    await openCategory("タブ")
    const tabs = [
      switchNamed("新しいタブを一番上に表示").checked,
      switchNamed("閉じたフォルダでも開いているタブをすべて表示").checked,
      switchNamed("Space を Chrome のタブグループと同期").checked,
    ]
    await openCategory("アーカイブ")
    const archive = [
      switchNamed("使っていないタブを自動でアーカイブ").checked,
      selectedLabelOf(idleTimePopUp()),
    ]

    expect([...tabs, ...archive]).toStrictEqual([false, false, true, true, "12 時間"])
  })

  it("when the settings change on another page, the controls follow", async () => {
    const { saveElsewhere } = await renderLoaded()
    await openCategory("タブ")

    await saveElsewhere({ syncTabGroups: true })

    await waitFor(() => {
      expect(switchNamed("Space を Chrome のタブグループと同期").checked).toBe(true)
    })
  })

  it("shows the extension's version", async () => {
    await renderLoaded()

    expect(screen.getByText(VERSION)).toBeTruthy()
  })

  it("links to the source code repository, opening it in a new tab", async () => {
    await renderLoaded()

    const link = screen.getByRole("link", { name: "git.example/katip" })
    expect([link.getAttribute("href"), link.getAttribute("target")]).toStrictEqual([
      REPOSITORY_URL,
      "_blank",
    ])
  })
})

describe("language", () => {
  it("when automatic, shows the page in the browser's preferred supported language", async () => {
    await renderLoaded({ browserLanguages: ["fr-FR", "es-MX"] })

    expect(heading()).toBe("Ajustes")
  })

  it("with a language chosen, shows the page in it whatever the browser's language", async () => {
    await renderLoaded({ saved: { locale: "zh" }, browserLanguages: ["ja-JP"] })

    expect(heading()).toBe("设置")
  })

  it("falls back to English when the browser has no supported language", async () => {
    await renderLoaded({ browserLanguages: ["fr-FR"] })

    expect(heading()).toBe("Settings")
  })

  it("the automatic option names the language it picks", async () => {
    await renderLoaded({ saved: { locale: "ja" }, browserLanguages: ["es-MX"] })

    expect(optionLabelsOf(languagePopUp())).toContain("自動（スペイン語）")
  })

  it("names each language in that language itself", async () => {
    await renderLoaded()

    expect(optionLabelsOf(languagePopUp())).toStrictEqual([
      "自動（日本語）",
      "English",
      "日本語",
      "简体中文",
      "Español",
    ])
  })

  it("choosing a language switches the page's text to it at once", async () => {
    await renderLoaded()

    await chooseLanguage("en")

    expect(heading()).toBe("Settings")
    expect(categoryTab("Tabs")).toBeTruthy()
  })

  it("saves the chosen language", async () => {
    const { readSaved } = await renderLoaded()

    await chooseLanguage("es")

    await waitFor(async () => {
      expect((await readSaved()).locale).toBe("es")
    })
  })

  it("going back to automatic shows the browser's language and saves automatic", async () => {
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

  it("sets the document's language to the language shown", async () => {
    await renderLoaded()

    await chooseLanguage("zh")

    expect(document.documentElement.lang).toBe("zh-Hans")
  })
})

describe("loading failure", () => {
  it("when the settings can't be loaded, asks for a reload in the browser's language", async () => {
    await renderOptions({ rejectedStorageOperation: "get" })

    expect(
      await screen.findByText("設定を読み込めませんでした。ページを再読み込みしてください。"),
    ).toBeTruthy()
  })
})

describe("switches", () => {
  it("saves as soon as it's flipped", async () => {
    const { readSaved } = await renderLoaded()
    await openCategory("タブ")

    await fireEvent.click(switchNamed("閉じたフォルダでも開いているタブをすべて表示"))

    await waitFor(async () => {
      expect((await readSaved()).showAllOpenTabsInCollapsedFolders).toBe(true)
    })
  })

  it("says it saved", async () => {
    await renderLoaded()
    await openCategory("タブ")

    await fireEvent.click(switchNamed("Space を Chrome のタブグループと同期"))

    expect(await screen.findByText("保存しました")).toBeTruthy()
  })

  it("when saving fails, flips back and says so", async () => {
    await renderOptions({ rejectedStorageOperation: "set" })
    await openCategory("タブ")
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

describe("split view", () => {
  it("in a browser with split view, says it's available", async () => {
    await renderLoaded({ supportsSplitView: true })

    await openCategory("タブ")

    expect(screen.getByText("使えます")).toBeTruthy()
  })

  it("in a browser without split view, says it isn't available and which Chrome it needs", async () => {
    await renderLoaded({ supportsSplitView: false })

    await openCategory("タブ")

    expect(screen.getByText("このブラウザでは使えません（Chrome 155 以降が必要）")).toBeTruthy()
    expect(screen.queryByText("使えます")).toBeNull()
  })
})

describe("auto archive", () => {
  it("while off, the time can't be chosen", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: false } } })

    await openCategory("アーカイブ")

    expect(idleTimePopUp().disabled).toBe(true)
  })

  it("turning it off makes the time unavailable", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: true } } })
    await openCategory("アーカイブ")

    await fireEvent.click(switchNamed("使っていないタブを自動でアーカイブ"))

    expect(idleTimePopUp().disabled).toBe(true)
  })

  it("turning it on makes the time available", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: false } } })
    await openCategory("アーカイブ")

    await fireEvent.click(switchNamed("使っていないタブを自動でアーカイブ"))

    expect(idleTimePopUp().disabled).toBe(false)
  })

  it("choosing a time saves it in minutes", async () => {
    const { readSaved } = await renderLoaded({ saved: { autoArchive: { enabled: true } } })
    await openCategory("アーカイブ")

    await chooseIdleMinutes(3 * 24 * 60)

    await waitFor(async () => {
      expect((await readSaved()).autoArchive.idleMinutes).toBe(3 * 24 * 60)
    })
    expect(selectedLabelOf(idleTimePopUp())).toBe("3 日")
  })

  it("lists the times shortest first, each in the largest unit that divides it", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: true } } })

    await openCategory("アーカイブ")

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

  it("shows a saved time that isn't among the choices as the chosen one", async () => {
    await renderLoaded({
      saved: { autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(90) } },
    })

    await openCategory("アーカイブ")

    expect(selectedLabelOf(idleTimePopUp())).toBe("90 分")
    expect(optionLabelsOf(idleTimePopUp())).toContain("90 分")
  })

  it.each([
    ["en-US", "Archive", "Archive after", ["30 minutes", "1 hour", "6 hours", "1 day", "1 week"]],
    ["zh-CN", "归档", "闲置多久后归档", ["30 分钟", "1 小时", "6 小时", "1 天", "1 周"]],
    ["es-ES", "Archivo", "Archivar tras", ["30 minutos", "1 hora", "6 horas", "1 día", "1 semana"]],
  ])(
    "in %s, writes the times with that language's units and word forms",
    async (browserLanguage, category, popUpName, expected) => {
      await renderLoaded({
        saved: { autoArchive: { enabled: true } },
        browserLanguages: [browserLanguage],
      })

      await openCategory(category)

      expect(optionLabelsOf(popUpNamed(popUpName))).toEqual(expect.arrayContaining(expected))
    },
  )
})

describe("browsing history search", () => {
  const historySwitch = () => switchNamed("閲覧履歴も検索する")
  const renderSpotlight = async () => {
    const rendered = await renderLoaded()
    await openCategory("Spotlight")
    return rendered
  }

  it("is off without the history permission", async () => {
    await renderSpotlight()

    expect(historySwitch().checked).toBe(false)
  })

  it("turning it on asks for the history permission, and is on once granted", async () => {
    const { permissions } = await renderSpotlight()

    await fireEvent.click(historySwitch())

    await waitFor(() => {
      expect(historySwitch().checked).toBe(true)
    })
    expect(await permissions((fake) => fake.requested)).toStrictEqual(["History"])
  })

  it("when the permission is denied, turns back off and says so", async () => {
    const { permissions } = await renderSpotlight()
    await permissions((fake) => fake.answerRequestsWith("Deny"))

    await fireEvent.click(historySwitch())

    expect(await screen.findByText("閲覧履歴へのアクセスが許可されませんでした")).toBeTruthy()
    expect(historySwitch().checked).toBe(false)
  })

  it("turning it off removes the history permission", async () => {
    const { permissions } = await renderSpotlight()
    await permissions((fake) => fake.grantElsewhere("History"))
    await waitFor(() => {
      expect(historySwitch().checked).toBe(true)
    })

    await fireEvent.click(historySwitch())

    await waitFor(async () => {
      expect(await permissions((fake) => fake.removed)).toStrictEqual(["History"])
    })
    expect(historySwitch().checked).toBe(false)
  })

  it("follows the permission when it changes on another page", async () => {
    const { permissions } = await renderSpotlight()

    await permissions((fake) => fake.grantElsewhere("History"))
    await waitFor(() => {
      expect(historySwitch().checked).toBe(true)
    })

    await permissions((fake) => fake.revokeElsewhere("History"))
    await waitFor(() => {
      expect(historySwitch().checked).toBe(false)
    })
  })
})

describe("shortcuts", () => {
  const renderShortcuts = async (options: RenderOptions = {}) => {
    const rendered = await renderLoaded(options)
    await openCategory("ショートカット")
    return rendered
  }

  it("shows each command with the key the browser assigned to it", async () => {
    await renderShortcuts()

    await waitFor(() => {
      expect(
        [
          "サイドパネルを開く",
          "Spotlight を開く",
          "URL をコピー",
          "URL を Markdown のリンクとしてコピー",
        ].map(keysShownFor),
      ).toStrictEqual(["⌃⌘S", "⌥T", "⇧⌘C", "⌃⇧⌘C"])
    })
  })

  it("says a command has no key when the browser assigned none", async () => {
    await renderShortcuts()

    await waitFor(() => {
      expect(
        ["Space の次のタブへ移る", "Space の前のタブへ移る", "タブをピン留め／ピン留めを外す"].map(
          keysShownFor,
        ),
      ).toStrictEqual(["未設定", "未設定", "未設定"])
    })
  })

  it("shows keys the browser writes with plus signs just as it writes them", async () => {
    await renderShortcuts({ assignedKeys: { "open-spotlight": "Alt+T" } })

    await waitFor(() => {
      expect(keysShownFor("Spotlight を開く")).toBe("Alt+T")
    })
  })

  it("reads the keys again when the page comes back into view, as they're changed in another tab", async () => {
    const { reassignKeysInBrowser } = await renderShortcuts()
    await waitFor(() => {
      expect(keysShownFor("Space の次のタブへ移る")).toBe("未設定")
    })

    reassignKeysInBrowser({ ...DEFAULT_KEYS, "next-tab-in-space": "⌥↓" })
    document.dispatchEvent(new Event("visibilitychange"))

    await waitFor(() => {
      expect(keysShownFor("Space の次のタブへ移る")).toBe("⌥↓")
    })
  })

  it("when the browser can't report the keys, doesn't claim any command has no key", async () => {
    await renderShortcuts({ assignedKeys: "Unavailable" })

    expect(keysShownFor("Spotlight を開く")).toBe("")
    expect(screen.queryByText("未設定")).toBeNull()
  })

  it("describes each copy switch with its key", async () => {
    await renderShortcuts()

    await waitFor(() => {
      const description = switchNamed("URL をコピー").getAttribute("aria-describedby")
      expect(document.getElementById(description ?? "")?.textContent).toBe("⇧⌘C")
    })
  })

  it("turning on copy URL saves it as on, without asking for any permission", async () => {
    const { readSaved, permissions } = await renderShortcuts()

    await fireEvent.click(switchNamed("URL をコピー"))

    await waitFor(async () => {
      expect((await readSaved()).pageShortcuts).toStrictEqual({
        copyUrl: true,
        copyMarkdownLink: false,
      })
    })
    expect(await permissions((fake) => fake.requested)).toStrictEqual([])
    expect(switchNamed("URL をコピー").checked).toBe(true)
  })

  it("turning on copy as a Markdown link saves it as on", async () => {
    const { readSaved } = await renderShortcuts()

    await fireEvent.click(switchNamed("URL を Markdown のリンクとしてコピー"))

    await waitFor(async () => {
      expect((await readSaved()).pageShortcuts.copyMarkdownLink).toBe(true)
    })
  })

  it("turning a copy shortcut off saves it as off", async () => {
    const { readSaved } = await renderShortcuts({ saved: { pageShortcuts: { copyUrl: true } } })

    await fireEvent.click(switchNamed("URL をコピー"))

    await waitFor(async () => {
      expect((await readSaved()).pageShortcuts.copyUrl).toBe(false)
    })
  })

  it("the edit button opens Chrome's shortcuts page in a new tab", async () => {
    const { browser } = await renderShortcuts()
    await browser((fake) => fake.seedWindow({ tabs: [{}] }))

    await fireEvent.click(screen.getByRole("button", { name: "Chrome で変更" }))

    await waitFor(async () => {
      const { tabs } = await browser((fake) => fake.snapshot)
      expect(
        tabs.filter((tab) => Option.contains(tab.url, "chrome://extensions/shortcuts")),
      ).toHaveLength(1)
    })
  })

  it("when the shortcuts page can't be opened, says so", async () => {
    const { browser } = await renderShortcuts()
    await browser((fake) => fake.seedWindow({ tabs: [{}] }))
    await browser((fake) => fake.failNext("tabs.create"))

    await fireEvent.click(screen.getByRole("button", { name: "Chrome で変更" }))

    expect(await screen.findByText("Chrome のショートカット設定を開けませんでした。")).toBeTruthy()
  })
})

describe("data export", () => {
  const exportButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "書き出す" })
  const content = '{"format":"katip.export","version":1}'
  const failureNote = "書き出せませんでした。少し待ってから、もう一度お試しください。"
  const renderData = async () => {
    const rendered = await renderLoaded()
    await openCategory("データ")
    return rendered
  }

  it("downloads what the background sent as a JSON file named with the date", async () => {
    const { answerExport, downloaded } = await renderData()
    answerExport({ _tag: "Exported", content })

    await fireEvent.click(exportButton())

    await waitFor(async () => {
      expect(await downloaded()).toStrictEqual([
        {
          name: expect.stringMatching(/^katip-export-\d{4}-\d{2}-\d{2}\.json$/),
          type: "application/json",
          content,
        },
      ])
    })
  })

  it("says it exported", async () => {
    const { answerExport } = await renderData()
    answerExport({ _tag: "Exported", content })

    await fireEvent.click(exportButton())

    expect(await screen.findByText("書き出しました")).toBeTruthy()
  })

  it("when the background reports a failure, downloads nothing and says so", async () => {
    const { answerExport, downloaded } = await renderData()
    answerExport({ _tag: "Failed" })

    await fireEvent.click(exportButton())

    expect(await screen.findByText(failureNote)).toBeTruthy()
    expect(await downloaded()).toStrictEqual([])
  })

  it("when the background hangs up before answering, downloads nothing and says so", async () => {
    const { answerExport, downloaded } = await renderData()
    answerExport({ _tag: "Disconnect" })

    await fireEvent.click(exportButton())

    expect(await screen.findByText(failureNote)).toBeTruthy()
    expect(await downloaded()).toStrictEqual([])
  })

  it("the button can't be pressed while exporting, and can again once done", async () => {
    const { answerExport } = await renderData()

    await fireEvent.click(exportButton())
    const disabledWhileExporting = exportButton().disabled
    answerExport({ _tag: "Exported", content })
    await screen.findByText("書き出しました")

    expect([disabledWhileExporting, exportButton().disabled]).toStrictEqual([true, false])
  })
})
