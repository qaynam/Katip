import "@testing-library/svelte/vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte"
import { Layer, ManagedRuntime, Result } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import {
  decodeExportFile,
  encodeExportFile,
  exportedSettingsOf,
  type LatestExport,
} from "#modules/export"
import { makeTranslator } from "#modules/i18n"
import { defaultSettings, SettingsRepository } from "#modules/settings"
import { themeOf } from "#modules/theme"
import { FakeBrowser } from "#platform/browser-testing"
import { KeyboardShortcuts } from "#platform/keyboard-shortcuts"
import type { ImportClientMessage } from "#protocol"
import arcSidebar from "../../modules/arc-import/fixtures/arc-sidebar.json?raw"
import DataImport from "./DataImport.svelte"
import { FakeFileDownloads } from "./testing/fake-file-downloads"
import { type ApplyAnswer, FakeImportServer } from "./testing/fake-import-server"
import { FakeOptionalPermissions } from "./testing/fake-optional-permissions"

const runtimes: Array<{ dispose: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()))
})

const katipFile = (spaces: LatestExport["spaces"]) =>
  Result.getOrThrow(
    encodeExportFile({
      format: "katip.export",
      version: 1,
      exportedAt: "2026-11-02T03:04:05.000Z",
      generator: { name: "Katip", version: "0.1.0" },
      spaces,
      favorites: [],
      settings: exportedSettingsOf(defaultSettings),
    }),
  )

const homeFile = katipFile([
  {
    id: "home",
    name: "Home",
    theme: themeOf([{ hue: 200, chroma: 0.5 }]),
    pinned: [{ type: "pin", title: "Docs", url: "https://docs.example/" }],
    tabs: [{ title: "News", url: "https://news.example/" }],
  },
])

const renderImport = () => {
  const browser = FakeBrowser.layer
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      browser,
      SettingsRepository.layer.pipe(Layer.provide(browser)),
      FakeOptionalPermissions.layer,
      FakeFileDownloads.layer,
      KeyboardShortcuts.layerTest({}),
      FakeImportServer.layer.pipe(Layer.provide(browser)),
    ),
  )
  runtimes.push(runtime)
  const finished: Array<boolean> = []
  render(DataImport, {
    props: {
      runtime,
      t: makeTranslator("en").t,
      onfinish: (done: boolean) => finished.push(done),
    },
  })
  return {
    finished,
    requests: (): Promise<ReadonlyArray<ImportClientMessage>> =>
      runtime.runPromise(FakeImportServer.use((server) => server.requests)),
    answerImportsWith: (answer: ApplyAnswer) =>
      runtime.runPromise(FakeImportServer.use((server) => server.answerImportsWith(answer))),
  }
}

const choose = (inputLabel: string, content: string, name: string) =>
  fireEvent.change(screen.getByLabelText(inputLabel), {
    target: { files: [new File([content], name, { type: "application/json" })] },
  })

const chooseArcFile = (content = arcSidebar, name = "StorableSidebar.json") =>
  choose("Arc’s sidebar file", content, name)

const chooseKatipFile = (content = homeFile, name = "katip-export-2026-11-02.json") =>
  choose("Katip export file", content, name)

const preview = (heading: string | RegExp) => screen.findByRole("region", { name: heading })

const listedUnder = (region: HTMLElement, heading: string) =>
  within(within(region).getByRole("list", { name: heading }))
    .getAllByRole("listitem")
    .map((item) => item.textContent?.trim())

const importButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "Import" })

const applyRequests = async (requests: () => Promise<ReadonlyArray<ImportClientMessage>>) =>
  (await requests()).filter((request) => request._tag === "Apply")

describe("choosing a file", () => {
  it("offers importing from Arc and from a Katip file, each choosing its own file", () => {
    renderImport()

    expect(
      screen
        .getAllByRole<HTMLButtonElement>("button", { name: "Choose File…" })
        .map((button) => button.disabled),
    ).toStrictEqual([false, false])
    expect(screen.getByText("Import from Arc")).toBeTruthy()
    expect(screen.getByText("Import a Katip file")).toBeTruthy()
  })

  it("says the file is read on this device and never leaves the browser", () => {
    renderImport()

    expect(screen.getByText(/never leaves your browser/)).toBeTruthy()
  })

  it("shows where Arc keeps its file on macOS, with the key to type the path, and on Windows", () => {
    renderImport()

    const location = screen.getByRole("region", { name: "Where to find Arc’s file" })

    expect(
      within(location).getByText("~/Library/Application Support/Arc/StorableSidebar.json"),
    ).toBeTruthy()
    expect(within(location).getByText(/⌘⇧G/)).toBeTruthy()
    expect(
      within(location).getByText(/%LOCALAPPDATA%\\Packages\\TheBrowserCompany\.Arc_/),
    ).toBeTruthy()
  })
})

describe("previewing Arc's file", () => {
  it("lists what would be added, what changes to fit Katip, and what's left out, before importing anything", async () => {
    const { requests } = renderImport()

    await chooseArcFile()
    const ready = await preview("Ready to import from Arc")

    expect({
      file: within(ready).getByText("StorableSidebar.json") !== null,
      added: listedUnder(ready, "To be added"),
      adjusted: listedUnder(ready, "Changed to fit Katip"),
      leftOut: listedUnder(ready, "Not imported"),
      applied: await applyRequests(requests),
    }).toStrictEqual({
      file: true,
      added: ["4 Spaces", "9 pinned tabs", "3 folders", "2 split views", "3 Favorites"],
      adjusted: [
        "1 folder is nested deeper than Katip allows, so its contents go into the folder above it.",
        "1 split view has more than two tabs. The first two stay split, and the rest become pinned tabs right after them.",
      ],
      leftOut: [
        "3 unpinned tabs, as unpinned tabs are temporary",
        "2 tabs that aren’t web pages, as only http and https addresses are imported",
        "1 item Katip has nothing like, such as a note or an easel",
      ],
      applied: [],
    })
  })

  it("offers to open the Favorites as pinned tabs, turned on", async () => {
    renderImport()

    await chooseArcFile()
    await preview("Ready to import from Arc")

    expect(
      screen.getByRole<HTMLInputElement>("switch", { name: "Open Favorites as pinned tabs" })
        .checked,
    ).toBe(true)
  })

  it("importing sends the file as a Katip export file, with Arc's Spaces and Favorites", async () => {
    const { requests, finished } = renderImport()
    await chooseArcFile()
    await preview("Ready to import from Arc")

    await fireEvent.click(importButton())
    await waitFor(() => expect(finished).toStrictEqual([true]))

    const [apply] = await applyRequests(requests)
    const document =
      apply?._tag === "Apply" ? Result.getOrThrow(decodeExportFile(apply.content)) : null
    expect({
      spaces: document?.spaces.map(({ name }) => name),
      favorites: document?.favorites.map(({ url }) => url),
      openFavorites: apply?._tag === "Apply" && apply.openFavorites,
      spacesWithoutTheme: apply?._tag === "Apply" && apply.spacesWithoutTheme,
    }).toStrictEqual({
      spaces: ["Work", "Reading", "", "Personal"],
      favorites: [
        "https://calendar.example.com/",
        "https://music.example.com/",
        "https://photos.example.com/",
      ],
      openFavorites: true,
      spacesWithoutTheme: ["space-untitled"],
    })
  })

  it("with opening Favorites turned off, leaves them out of the list and of the import", async () => {
    const { requests, finished } = renderImport()
    await chooseArcFile()
    const ready = await preview("Ready to import from Arc")

    await fireEvent.click(screen.getByRole("switch", { name: "Open Favorites as pinned tabs" }))
    const added = listedUnder(ready, "To be added")
    await fireEvent.click(importButton())
    await waitFor(() => expect(finished).toStrictEqual([true]))

    const [apply] = await applyRequests(requests)
    expect([
      added.includes("3 Favorites"),
      apply?._tag === "Apply" && apply.openFavorites,
    ]).toStrictEqual([false, false])
  })

  it("Cancel closes the preview without importing", async () => {
    const { requests } = renderImport()
    await chooseArcFile()
    await preview("Ready to import from Arc")

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect([
      screen.queryByRole("region", { name: "Ready to import from Arc" }),
      await applyRequests(requests),
    ]).toStrictEqual([null, []])
  })

  it("closes the preview once imported, and reports that it finished", async () => {
    const { finished } = renderImport()
    await chooseArcFile()
    await preview("Ready to import from Arc")

    await fireEvent.click(importButton())

    await waitFor(() => expect(finished).toStrictEqual([true]))
    expect(screen.queryByRole("region", { name: "Ready to import from Arc" })).toBeNull()
  })

  it("while importing, nothing can be chosen or pressed again", async () => {
    const { answerImportsWith } = renderImport()
    await answerImportsWith("Silence")
    await chooseArcFile()
    await preview("Ready to import from Arc")

    await fireEvent.click(importButton())

    expect(
      [
        importButton(),
        ...screen.getAllByRole<HTMLButtonElement>("button", { name: "Choose File…" }),
      ].map((button) => button.disabled),
    ).toStrictEqual([true, true, true])
  })

  it.each([
    ["reports a failure", "Failed"],
    ["hangs up without answering", "Disconnect"],
  ] as const)(
    "when the background %s, closes the preview and reports that the import didn't finish",
    async (_, answer) => {
      const { answerImportsWith, finished } = renderImport()
      await answerImportsWith(answer)
      await chooseArcFile()
      await preview("Ready to import from Arc")

      await fireEvent.click(importButton())

      await waitFor(() => expect(finished).toStrictEqual([false]))
      expect(screen.queryByRole("region", { name: "Ready to import from Arc" })).toBeNull()
    },
  )
})

describe("previewing a Katip file", () => {
  it("lists what would be added and left out, including the file's settings", async () => {
    renderImport()

    await chooseKatipFile()
    const ready = await preview("Ready to import a Katip file")

    expect([listedUnder(ready, "To be added"), listedUnder(ready, "Not imported")]).toStrictEqual([
      ["1 Space", "1 pinned tab"],
      [
        "1 unpinned tab, as unpinned tabs are temporary",
        "The file’s settings. Yours stay as they are.",
      ],
    ])
  })

  it("importing sends the file as it is, with no Spaces left for Katip to pick a theme or a name for", async () => {
    const { requests, finished } = renderImport()
    await chooseKatipFile()
    await preview("Ready to import a Katip file")

    await fireEvent.click(importButton())
    await waitFor(() => expect(finished).toStrictEqual([true]))

    expect(await applyRequests(requests)).toStrictEqual([
      {
        _tag: "Apply",
        content: homeFile,
        openFavorites: true,
        spacesWithoutTheme: [],
        spacesNamedByImport: [],
      },
    ])
  })

  it("a file with nothing to import says so and can't be imported", async () => {
    renderImport()

    await chooseKatipFile(katipFile([]))
    const ready = await preview("Ready to import a Katip file")

    expect([
      within(ready).getByText("There’s nothing in this file to import.") !== null,
      importButton().disabled,
    ]).toStrictEqual([true, true])
  })
})

describe("files that can't be imported", () => {
  it.each([
    [
      "a file that isn't Arc's sidebar file, for Arc",
      () => chooseArcFile("not json"),
      "This isn’t Arc’s sidebar file. Choose StorableSidebar.json.",
    ],
    [
      "a Katip file, for Arc",
      () => chooseArcFile(homeFile),
      "This is a file exported from Katip. Use Import a Katip file instead.",
    ],
    [
      "a file that isn't a Katip file, for Katip",
      () => chooseKatipFile('{"something":"else"}'),
      "This isn’t a file exported from Katip.",
    ],
    [
      "Arc's sidebar file, for Katip",
      () => chooseKatipFile(arcSidebar),
      "This is Arc’s sidebar file. Use Import from Arc instead.",
    ],
    [
      "a file from a newer Katip",
      () => chooseKatipFile(JSON.stringify({ format: "katip.export", version: 99 })),
      "This file was exported from a newer version of Katip. Update Katip, then try again.",
    ],
    [
      "a damaged Katip file",
      () => chooseKatipFile(JSON.stringify({ format: "katip.export", version: 1, spaces: 3 })),
      "This Katip file is damaged and can’t be read.",
    ],
  ])("%s says why, and shows no preview", async (_, chooseFile, problem) => {
    renderImport()

    await chooseFile()

    expect((await screen.findByRole("alert")).textContent).toBe(problem)
    expect(screen.queryByRole("button", { name: "Import" })).toBeNull()
  })
})
