import "@testing-library/svelte/vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte"
import { Effect, Layer, ManagedRuntime, Option, Queue, Schema, Stream } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { BangCatalog, DEFAULT_BANG_FORMAT } from "#modules/bangs"
import { IdleMinutes, SettingsRepository, type SettingsPatch } from "#modules/settings"
import { SiteCommands } from "#modules/site-commands"
import { LATEST_RELEASE_API_URL, Updates } from "#modules/updates"
import { BrowserApiError, BrowserEvents, Storage, type StorageArea } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { FakeHttp, httpResponse, unreachable } from "#platform/http"
import { KeyboardShortcuts } from "#platform/keyboard-shortcuts"
import { EXPORT_PORT_NAME, ExportServerMessage } from "#protocol"
import arcSidebar from "../../modules/arc-import/fixtures/arc-sidebar.json?raw"
import App from "./App.svelte"
import { FakeFileDownloads } from "./testing/fake-file-downloads"
import { type ApplyAnswer, FakeImportServer } from "./testing/fake-import-server"
import { FakeOptionalPermissions } from "./testing/fake-optional-permissions"

const VERSION = "1.2.3"
const RELEASED_AT = "2026-11-05T10:00:00+09:00"
const REPOSITORY_URL = "https://git.example/katip"

/** Keys as macOS reports the defaults the manifest suggests. */
const DEFAULT_KEYS: Readonly<Record<string, string>> = {
  _execute_action: "⌃⌘S",
  "open-spotlight": "⌥T",
  "copy-current-url": "⇧⌘C",
  "copy-current-url-as-markdown": "⌃⇧⌘C",
}

const BUNDLED_BANGS = [
  {
    name: "GitHub",
    triggers: ["gh", "github"] as const,
    template: "https://github.com/search?q=%s",
    format: DEFAULT_BANG_FORMAT,
  },
  {
    name: "GitLab",
    triggers: ["gl", "gitlab"] as const,
    template: "https://gitlab.com/search?search=%s",
    format: DEFAULT_BANG_FORMAT,
  },
]

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
      SiteCommands.layer.pipe(Layer.provide(storage)),
      BangCatalog.layerTest(BUNDLED_BANGS),
      browser,
      FakeOptionalPermissions.layer,
      FakeFileDownloads.layer,
      keyboardShortcutsReporting(browserKeys),
      exportServerAnswering(exportAnswers).pipe(Layer.provide(browser)),
      FakeImportServer.layer.pipe(Layer.provide(browser)),
      Updates.layer(VERSION).pipe(Layer.provideMerge(FakeHttp.layer), Layer.provide(browser)),
    ),
  )
  runtimes.push(runtime)
  return runtime
}

const renderOptions = async ({
  saved = {},
  browserLanguages = ["en-US"],
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
    props: {
      runtime,
      version: VERSION,
      releasedAt: RELEASED_AT,
      repositoryUrl: REPOSITORY_URL,
      browserLanguages,
      faviconUrl: () => null,
    },
  })
  return {
    readSaved: () => runtime.runPromise(SettingsRepository.use((repository) => repository.get)),
    readCommands: () => runtime.runPromise(SiteCommands.use((commands) => commands.get)),
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
    answerImportsWith: (answer: ApplyAnswer) =>
      runtime.runPromise(FakeImportServer.use((server) => server.answerImportsWith(answer))),
    /** Makes GitHub answer update checks with `version` as the latest release, null for no answer. */
    publishOnGitHub: (version: string | null) =>
      runtime.runPromise(
        FakeHttp.use((http) =>
          http.route(LATEST_RELEASE_API_URL, (request) =>
            version === null
              ? unreachable(request)
              : Effect.succeed(
                  httpResponse(
                    200,
                    JSON.stringify({
                      tag_name: `v${version}`,
                      html_url: `https://github.com/qaynam/Katip/releases/tag/v${version}`,
                      published_at: "2026-11-20T09:00:00Z",
                    }),
                  ),
                ),
          ),
        ),
      ),
    /** Makes GitHub turn update checks away, as it does past its rate limit, until `until`. */
    limitOnGitHub: (until: Date) =>
      runtime.runPromise(
        FakeHttp.use((http) =>
          http.route(LATEST_RELEASE_API_URL, () =>
            Effect.succeed(
              httpResponse(403, "{}", {
                "x-ratelimit-remaining": "0",
                "x-ratelimit-reset": String(until.getTime() / 1000),
              }),
            ),
          ),
        ),
      ),
    githubRequests: () => runtime.runPromise(FakeHttp.use((http) => http.requests)),
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

const languagePopUp = (name = "Language") => popUpNamed(name)
const chooseLanguage = (value: string, popUpName?: string) =>
  fireEvent.change(languagePopUp(popUpName), { target: { value } })

const idleTimePopUp = () => popUpNamed("Archive after")
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

    expect(selectedCategory()).toBe("General")
    expect(languagePopUp()).toBeTruthy()
  })

  it("lists every category in order", async () => {
    await renderLoaded()

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.trim())).toStrictEqual([
      "General",
      "Tabs",
      "Archive",
      "Spotlight",
      "Shortcuts",
      "Data",
    ])
  })

  it("choosing a category shows its settings in place of the previous category's", async () => {
    await renderLoaded()

    await openCategory("Tabs")

    expect(selectedCategory()).toBe("Tabs")
    expect(switchNamed("Show new tabs at the top")).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "Language" })).toBeNull()
  })

  it("names the shown settings after the chosen category", async () => {
    await renderLoaded()

    await openCategory("Archive")

    expect(screen.getByRole("tabpanel", { name: "Archive" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Archive")
  })

  it("arrow keys move to the next or previous category and focus it, wrapping past the ends", async () => {
    await renderLoaded()
    categoryTab("General").focus()

    await fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowDown" })
    const afterDown = selectedCategory()
    await fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowUp" })
    await fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowUp" })

    expect([afterDown, selectedCategory(), document.activeElement?.textContent?.trim()]).toEqual([
      "Tabs",
      "Data",
      "Data",
    ])
  })

  it("Home and End move to the first and last category", async () => {
    await renderLoaded()
    categoryTab("General").focus()

    await fireEvent.keyDown(document.activeElement ?? document.body, { key: "End" })
    const afterEnd = selectedCategory()
    await fireEvent.keyDown(document.activeElement ?? document.body, { key: "Home" })

    expect([afterEnd, selectedCategory()]).toEqual(["Data", "General"])
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

    await openCategory("Shortcuts")

    expect([location.hash, history.length]).toStrictEqual(["#shortcuts", entriesBefore])
  })

  it("changing the URL fragment opens the category it names", async () => {
    await renderLoaded()

    location.hash = "#data"

    expect(await screen.findByRole("button", { name: "Export" })).toBeTruthy()
    expect(selectedCategory()).toBe("Data")
  })

  it("opens on the category the URL fragment names", async () => {
    history.replaceState(null, "", "#archive")

    await renderOptions()

    expect(
      await screen.findByRole("switch", { name: "Archive inactive tabs automatically" }),
    ).toBeTruthy()
    expect(selectedCategory()).toBe("Archive")
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

    await openCategory("Tabs")
    const tabs = [
      switchNamed("Show new tabs at the top").checked,
      switchNamed("Show all open tabs in collapsed folders").checked,
      switchNamed("Sync Spaces with Chrome tab groups").checked,
    ]
    await openCategory("Archive")
    const archive = [
      switchNamed("Archive inactive tabs automatically").checked,
      selectedLabelOf(idleTimePopUp()),
    ]

    expect([...tabs, ...archive]).toStrictEqual([false, false, true, true, "12 hours"])
  })

  it("when the settings change on another page, the controls follow", async () => {
    const { saveElsewhere } = await renderLoaded()
    await openCategory("Tabs")

    await saveElsewhere({ syncTabGroups: true })

    await waitFor(() => {
      expect(switchNamed("Sync Spaces with Chrome tab groups").checked).toBe(true)
    })
  })

  it("shows the extension's version", async () => {
    await renderLoaded()

    expect(screen.getByText(VERSION)).toBeTruthy()
  })

  it("links to the repository on GitHub, opening it in a new tab", async () => {
    await renderLoaded()

    const link = screen.getByRole("link", { name: "git.example/katip" })
    expect([
      link.closest(".row")?.querySelector(".label")?.textContent,
      link.getAttribute("href"),
      link.getAttribute("target"),
    ]).toStrictEqual(["GitHub", REPOSITORY_URL, "_blank"])
  })

  it("keeps the same backdrop tint whichever category is open", async () => {
    await renderLoaded()
    const tint = () =>
      document
        .querySelector<HTMLElement>(".backdrop")
        ?.style.getPropertyValue("--backdrop-background")
    const first = tint()

    await fireEvent.click(screen.getAllByRole("tab")[1] as HTMLElement)

    expect([first !== "", tint()]).toStrictEqual([true, first])
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
    await renderLoaded({ saved: { locale: "en" }, browserLanguages: ["es-MX"] })

    expect(optionLabelsOf(languagePopUp())).toContain("Automatic (Spanish)")
  })

  it("names each language in that language itself", async () => {
    await renderLoaded()

    expect(optionLabelsOf(languagePopUp())).toStrictEqual([
      "Automatic (English)",
      "English",
      "日本語",
      "简体中文",
      "Español",
    ])
  })

  it("choosing a language switches the page's text to it at once", async () => {
    await renderLoaded()

    await chooseLanguage("ja")

    expect(heading()).toBe("設定")
    expect(categoryTab("タブ")).toBeTruthy()
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
      await screen.findByText("Couldn’t load your settings. Reload this page to try again."),
    ).toBeTruthy()
  })
})

describe("updates", () => {
  it("shows when the running version was released", async () => {
    await renderLoaded()

    expect(screen.getByText("Released on November 5, 2026")).toBeTruthy()
  })

  it("says Katip is up to date when GitHub's latest release is the running version", async () => {
    const { publishOnGitHub } = await renderLoaded()
    await publishOnGitHub(VERSION)

    await fireEvent.click(screen.getByRole("button", { name: "Check for Updates" }))

    expect(await screen.findByText("Katip is up to date.")).toBeTruthy()
  })

  it("names a newer version and links to its release page, opening it in a new tab", async () => {
    const { publishOnGitHub } = await renderLoaded()
    await publishOnGitHub("1.3.0")

    await fireEvent.click(screen.getByRole("button", { name: "Check for Updates" }))

    const link = await screen.findByRole("link", { name: "Open release page" })
    expect(screen.getByText(/^Version 1\.3\.0 is available\./)).toBeTruthy()
    expect([link.getAttribute("href"), link.getAttribute("target")]).toStrictEqual([
      "https://github.com/qaynam/Katip/releases/tag/v1.3.0",
      "_blank",
    ])
  })

  it("says GitHub couldn't be reached, leaving the button to try again", async () => {
    const { publishOnGitHub, githubRequests } = await renderLoaded()
    await publishOnGitHub(null)
    const check = screen.getByRole("button", { name: "Check for Updates" })

    await fireEvent.click(check)
    expect(
      await screen.findByText("Couldn’t reach GitHub. Wait a moment, then try again."),
    ).toBeTruthy()
    await fireEvent.click(check)

    await waitFor(async () => {
      expect(await githubRequests()).toHaveLength(2)
    })
  })

  it("says GitHub is limiting requests rather than unreachable, and when to try again", async () => {
    const { limitOnGitHub } = await renderLoaded()
    await limitOnGitHub(new Date(2026, 10, 10, 12, 54))

    await fireEvent.click(screen.getByRole("button", { name: "Check for Updates" }))

    expect(
      await screen.findByText(
        "GitHub is limiting requests from your network for now. Try again after 12:54 PM.",
      ),
    ).toBeTruthy()
  })

  it("asks GitHub nothing until the button is pressed", async () => {
    const { githubRequests } = await renderLoaded()

    expect(await githubRequests()).toStrictEqual([])
  })

  it("turns automatic checks off, saving at once", async () => {
    const { readSaved } = await renderLoaded()

    await fireEvent.click(switchNamed("Check for updates automatically"))

    await waitFor(async () => {
      expect((await readSaved()).checkForUpdates).toBe(false)
    })
  })
})

describe("switches", () => {
  it("saves as soon as it's flipped", async () => {
    const { readSaved } = await renderLoaded()
    await openCategory("Tabs")

    await fireEvent.click(switchNamed("Show all open tabs in collapsed folders"))

    await waitFor(async () => {
      expect((await readSaved()).showAllOpenTabsInCollapsedFolders).toBe(true)
    })
  })

  it("says it saved", async () => {
    await renderLoaded()
    await openCategory("Tabs")

    await fireEvent.click(switchNamed("Sync Spaces with Chrome tab groups"))

    expect(await screen.findByText("Saved")).toBeTruthy()
  })

  it("when saving fails, flips back and says so", async () => {
    await renderOptions({ rejectedStorageOperation: "set" })
    await openCategory("Tabs")
    const sync = await screen.findByRole<HTMLInputElement>("switch", {
      name: "Sync Spaces with Chrome tab groups",
    })

    await fireEvent.click(sync)

    expect(
      await screen.findByText("Couldn’t save the change. Wait a moment, then try again."),
    ).toBeTruthy()
    expect(sync.checked).toBe(false)
  })
})

describe("split view", () => {
  it("in a browser with split view, says it's available", async () => {
    await renderLoaded({ supportsSplitView: true })

    await openCategory("Tabs")

    expect(screen.getByText("Available")).toBeTruthy()
  })

  it("in a browser without split view, says it isn't available and which Chrome it needs", async () => {
    await renderLoaded({ supportsSplitView: false })

    await openCategory("Tabs")

    expect(
      screen.getByText("Not available in this browser (requires Chrome 155 or later)"),
    ).toBeTruthy()
    expect(screen.queryByText("Available")).toBeNull()
  })
})

describe("auto archive", () => {
  it("while off, the time can't be chosen", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: false } } })

    await openCategory("Archive")

    expect(idleTimePopUp().disabled).toBe(true)
  })

  it("turning it off makes the time unavailable", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: true } } })
    await openCategory("Archive")

    await fireEvent.click(switchNamed("Archive inactive tabs automatically"))

    expect(idleTimePopUp().disabled).toBe(true)
  })

  it("turning it on makes the time available", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: false } } })
    await openCategory("Archive")

    await fireEvent.click(switchNamed("Archive inactive tabs automatically"))

    expect(idleTimePopUp().disabled).toBe(false)
  })

  it("choosing a time saves it in minutes", async () => {
    const { readSaved } = await renderLoaded({ saved: { autoArchive: { enabled: true } } })
    await openCategory("Archive")

    await chooseIdleMinutes(3 * 24 * 60)

    await waitFor(async () => {
      expect((await readSaved()).autoArchive.idleMinutes).toBe(3 * 24 * 60)
    })
    expect(selectedLabelOf(idleTimePopUp())).toBe("3 days")
  })

  it("lists the times shortest first, each in the largest unit that divides it", async () => {
    await renderLoaded({ saved: { autoArchive: { enabled: true } } })

    await openCategory("Archive")

    expect(optionLabelsOf(idleTimePopUp())).toStrictEqual([
      "30 minutes",
      "1 hour",
      "3 hours",
      "6 hours",
      "12 hours",
      "1 day",
      "3 days",
      "1 week",
    ])
  })

  it("shows a saved time that isn't among the choices as the chosen one", async () => {
    await renderLoaded({
      saved: { autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(90) } },
    })

    await openCategory("Archive")

    expect(selectedLabelOf(idleTimePopUp())).toBe("90 minutes")
    expect(optionLabelsOf(idleTimePopUp())).toContain("90 minutes")
  })

  it.each([
    [
      "ja-JP",
      "アーカイブ",
      "アーカイブするまでの時間",
      ["30 分", "1 時間", "6 時間", "1 日", "1 週間"],
    ],
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
  const historySwitch = () => switchNamed("Search browsing history too")
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

    expect(await screen.findByText("Access to browsing history wasn’t allowed.")).toBeTruthy()
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

describe("bangs", () => {
  it("are on until turned off, which is saved", async () => {
    const { readSaved } = await renderLoaded()
    await openCategory("Spotlight")
    expect(switchNamed("Search sites with bangs").checked).toBe(true)

    await fireEvent.click(switchNamed("Search sites with bangs"))

    await waitFor(async () => {
      expect((await readSaved()).bangs).toBe(false)
    })
  })
})

describe("site commands", () => {
  const renderCommands = async () => {
    const rendered = await renderLoaded()
    await openCategory("Spotlight")
    await screen.findByRole("heading", { name: "Commands" })
    return rendered
  }

  const commandList = () =>
    within(screen.getByRole("region", { name: "Commands" })).getAllByRole("listitem")

  const commandTitles = () =>
    commandList().map((item) => item.querySelector(".title")?.textContent ?? "")

  const commandForm = (name: string) => screen.getByRole("form", { name })

  const fillIn = (form: HTMLElement, label: string, value: string) =>
    fireEvent.input(within(form).getByLabelText(label), { target: { value } })

  it("lists the commands Katip comes with", async () => {
    await renderCommands()

    expect(commandTitles().slice(0, 3)).toStrictEqual([
      "New Google Doc",
      "New Google Sheet",
      "New Google Slide",
    ])
  })

  it("removing one takes it off the list until the defaults are restored", async () => {
    const { readCommands } = await renderCommands()

    await fireEvent.click(screen.getByRole("button", { name: "Remove New Google Doc" }))

    await waitFor(() => expect(commandTitles()).not.toContain("New Google Doc"))
    expect((await readCommands()).removedDefaults).toStrictEqual(["google-doc"])

    await fireEvent.click(screen.getByRole("button", { name: "Restore Default Commands" }))

    await waitFor(() => expect(commandTitles()[0]).toBe("New Google Doc"))
    expect(screen.queryByRole("button", { name: "Restore Default Commands" })).toBeNull()
  })

  it("adding one from a site in the list of bangs fills in a search of that site", async () => {
    const { readCommands } = await renderCommands()
    await fireEvent.click(screen.getByRole("button", { name: "Add Command" }))
    const form = commandForm("New Command")

    await fillIn(form, "Find a Site", "git")
    await fireEvent.click(await within(form).findByRole("button", { name: /GitHub/ }))

    expect(
      ["Name", "URL", "Keyword"].map(
        (label) => within(form).getByLabelText<HTMLInputElement>(label).value,
      ),
    ).toStrictEqual(["Search GitHub", "https://github.com/search?q=%s", "gh"])

    await fireEvent.click(within(form).getByRole("button", { name: "Save" }))

    await waitFor(() => expect(commandTitles().at(-1)).toBe("Search GitHub"))
    const saved = await readCommands()
    expect(saved.added.map(({ title, url, keyword }) => [title, url, keyword])).toStrictEqual([
      ["Search GitHub", "https://github.com/search?q=%s", "gh"],
    ])
    expect(screen.queryByRole("form", { name: "New Command" })).toBeNull()
  })

  it("adding one typed by hand saves it once it is complete", async () => {
    const { readCommands } = await renderCommands()
    await fireEvent.click(screen.getByRole("button", { name: "Add Command" }))
    const form = commandForm("New Command")

    await fillIn(form, "Name", "Intranet")
    await fillIn(form, "URL", "intranet.example/home")
    await fireEvent.click(within(form).getByRole("button", { name: "Save" }))

    await waitFor(async () => {
      expect((await readCommands()).added.map(({ url }) => url)).toStrictEqual([
        "https://intranet.example/home",
      ])
    })
  })

  it("isn't saved while something is missing, and says what", async () => {
    const { readCommands } = await renderCommands()
    await fireEvent.click(screen.getByRole("button", { name: "Add Command" }))
    const form = commandForm("New Command")

    await fillIn(form, "URL", "https://linear.app/search?q=%s")
    await fireEvent.click(within(form).getByRole("button", { name: "Save" }))

    expect(within(form).getByText("Enter a name.")).toBeTruthy()
    expect(
      within(form).getByText("A command that searches needs a keyword to type the search after."),
    ).toBeTruthy()
    expect(within(form).getByLabelText("Name").getAttribute("aria-invalid")).toBe("true")
    expect((await readCommands()).added).toStrictEqual([])
  })

  it("can't take a keyword another command has", async () => {
    await renderCommands()
    await fireEvent.click(screen.getByRole("button", { name: "Add Command" }))
    const first = commandForm("New Command")
    await fillIn(first, "Name", "Search Linear")
    await fillIn(first, "URL", "https://linear.app/search?q=%s")
    await fillIn(first, "Keyword", "lin")
    await fireEvent.click(within(first).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(commandTitles().at(-1)).toBe("Search Linear"))

    await fireEvent.click(screen.getByRole("button", { name: "Add Command" }))
    const second = commandForm("New Command")
    await fillIn(second, "Name", "Linear again")
    await fillIn(second, "URL", "https://linear.app/")
    await fillIn(second, "Keyword", "!LIN")
    await fireEvent.click(within(second).getByRole("button", { name: "Save" }))

    expect(within(second).getByText("Another command has this keyword.")).toBeTruthy()
  })

  it("editing one changes it where it is listed", async () => {
    const { readCommands } = await renderCommands()
    await fireEvent.click(screen.getByRole("button", { name: "Add Command" }))
    const adding = commandForm("New Command")
    await fillIn(adding, "Name", "Intranet")
    await fillIn(adding, "URL", "https://intranet.example/")
    await fireEvent.click(within(adding).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(commandTitles().at(-1)).toBe("Intranet"))

    await fireEvent.click(screen.getByRole("button", { name: "Edit Intranet" }))
    const editing = commandForm("Edit Command")
    await fillIn(editing, "Name", "Company Intranet")
    await fireEvent.click(within(editing).getByRole("button", { name: "Save" }))

    await waitFor(() => expect(commandTitles().at(-1)).toBe("Company Intranet"))
    expect((await readCommands()).added.map(({ title }) => title)).toStrictEqual([
      "Company Intranet",
    ])
  })

  it("Escape gives up adding one", async () => {
    const { readCommands } = await renderCommands()
    await fireEvent.click(screen.getByRole("button", { name: "Add Command" }))
    const form = commandForm("New Command")
    await fillIn(form, "Name", "Half done")

    await fireEvent.keyDown(within(form).getByLabelText("Name"), { key: "Escape" })

    expect(screen.queryByRole("form", { name: "New Command" })).toBeNull()
    expect((await readCommands()).added).toStrictEqual([])
  })
})

describe("shortcuts", () => {
  const renderShortcuts = async (options: RenderOptions = {}) => {
    const rendered = await renderLoaded(options)
    await openCategory("Shortcuts")
    return rendered
  }

  it("shows each command with the key the browser assigned to it", async () => {
    await renderShortcuts()

    await waitFor(() => {
      expect(
        ["Open the side panel", "Open Spotlight", "Copy URL", "Copy URL as a Markdown link"].map(
          keysShownFor,
        ),
      ).toStrictEqual(["⌃⌘S", "⌥T", "⇧⌘C", "⌃⇧⌘C"])
    })
  })

  it("says a command has no key when the browser assigned none", async () => {
    await renderShortcuts()

    await waitFor(() => {
      expect(
        ["Next tab in the Space", "Previous tab in the Space", "Pin or unpin the tab"].map(
          keysShownFor,
        ),
      ).toStrictEqual(["Not set", "Not set", "Not set"])
    })
  })

  it("shows keys the browser writes with plus signs just as it writes them", async () => {
    await renderShortcuts({ assignedKeys: { "open-spotlight": "Alt+T" } })

    await waitFor(() => {
      expect(keysShownFor("Open Spotlight")).toBe("Alt+T")
    })
  })

  it("reads the keys again when the page comes back into view, as they're changed in another tab", async () => {
    const { reassignKeysInBrowser } = await renderShortcuts()
    await waitFor(() => {
      expect(keysShownFor("Next tab in the Space")).toBe("Not set")
    })

    reassignKeysInBrowser({ ...DEFAULT_KEYS, "next-tab-in-space": "⌥↓" })
    document.dispatchEvent(new Event("visibilitychange"))

    await waitFor(() => {
      expect(keysShownFor("Next tab in the Space")).toBe("⌥↓")
    })
  })

  it("when the browser can't report the keys, doesn't claim any command has no key", async () => {
    await renderShortcuts({ assignedKeys: "Unavailable" })

    expect(keysShownFor("Open Spotlight")).toBe("")
    expect(screen.queryByText("Not set")).toBeNull()
  })

  it("describes each copy switch with its key", async () => {
    await renderShortcuts()

    await waitFor(() => {
      const description = switchNamed("Copy URL").getAttribute("aria-describedby")
      expect(document.getElementById(description ?? "")?.textContent).toBe("⇧⌘C")
    })
  })

  it("turning on copy URL saves it as on, without asking for any permission", async () => {
    const { readSaved, permissions } = await renderShortcuts()

    await fireEvent.click(switchNamed("Copy URL"))

    await waitFor(async () => {
      expect((await readSaved()).pageShortcuts).toStrictEqual({
        copyUrl: true,
        copyMarkdownLink: false,
      })
    })
    expect(await permissions((fake) => fake.requested)).toStrictEqual([])
    expect(switchNamed("Copy URL").checked).toBe(true)
  })

  it("turning on copy as a Markdown link saves it as on", async () => {
    const { readSaved } = await renderShortcuts()

    await fireEvent.click(switchNamed("Copy URL as a Markdown link"))

    await waitFor(async () => {
      expect((await readSaved()).pageShortcuts.copyMarkdownLink).toBe(true)
    })
  })

  it("turning a copy shortcut off saves it as off", async () => {
    const { readSaved } = await renderShortcuts({ saved: { pageShortcuts: { copyUrl: true } } })

    await fireEvent.click(switchNamed("Copy URL"))

    await waitFor(async () => {
      expect((await readSaved()).pageShortcuts.copyUrl).toBe(false)
    })
  })

  it("the edit button opens Chrome's shortcuts page in a new tab", async () => {
    const { browser } = await renderShortcuts()
    await browser((fake) => fake.seedWindow({ tabs: [{}] }))

    await fireEvent.click(screen.getByRole("button", { name: "Edit in Chrome" }))

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

    await fireEvent.click(screen.getByRole("button", { name: "Edit in Chrome" }))

    expect(await screen.findByText("Couldn’t open Chrome’s shortcuts page.")).toBeTruthy()
  })
})

describe("data export", () => {
  const exportButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "Export" })
  const content = '{"format":"katip.export","version":1}'
  const failureNote = "Couldn’t export your data. Wait a moment, then try again."
  const renderData = async () => {
    const rendered = await renderLoaded()
    await openCategory("Data")
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

    expect(await screen.findByText("Exported")).toBeTruthy()
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
    await screen.findByText("Exported")

    expect([disabledWhileExporting, exportButton().disabled]).toStrictEqual([true, false])
  })
})

describe("data import", () => {
  const renderData = async () => {
    const rendered = await renderLoaded()
    await openCategory("Data")
    return rendered
  }
  const importArcFile = async () => {
    await fireEvent.change(screen.getByLabelText("Arc’s sidebar file"), {
      target: { files: [new File([arcSidebar], "StorableSidebar.json")] },
    })
    await screen.findByRole("region", { name: "Ready to import from Arc" })
    await fireEvent.click(screen.getByRole("button", { name: "Import" }))
  }

  it("the Data category offers importing from Arc and from a Katip file", async () => {
    await renderData()

    expect([
      screen.getByText("Import from Arc") !== null,
      screen.getByText("Import a Katip file") !== null,
    ]).toStrictEqual([true, true])
  })

  it("says it imported", async () => {
    await renderData()

    await importArcFile()

    expect(await screen.findByText("Imported")).toBeTruthy()
  })

  it("when the import doesn't finish, says the Spaces added so far are kept", async () => {
    const { answerImportsWith } = await renderData()
    await answerImportsWith("Failed")

    await importArcFile()

    expect(
      await screen.findByText(
        "Couldn’t finish the import. Any Spaces added before it stopped are kept.",
      ),
    ).toBeTruthy()
  })
})
