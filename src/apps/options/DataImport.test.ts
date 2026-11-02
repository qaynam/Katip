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

/** The document the import sent, with the Spaces it named for Katip to number. */
const appliedDocument = async (requests: () => Promise<ReadonlyArray<ImportClientMessage>>) => {
  const [apply] = await applyRequests(requests)
  if (apply?._tag !== "Apply") throw new Error("nothing was imported")
  return {
    document: Result.getOrThrow(decodeExportFile(apply.content)),
    spacesNamedByImport: apply.spacesNamedByImport,
  }
}

const checkboxesIn = (element: HTMLElement) =>
  within(element)
    .getAllByRole<HTMLInputElement>("checkbox")
    .map((box) => ({ name: box.closest("label")?.textContent?.trim(), checked: box.checked }))

const checkbox = (name: string) => screen.getByRole<HTMLInputElement>("checkbox", { name })

/** An Arc sidebar file of Spaces in the default profile, each with one pinned tab. */
const defaultProfileFile = (titles: ReadonlyArray<string>) =>
  JSON.stringify({
    sidebar: {
      containers: [
        {
          spaces: titles.map((title) => ({
            id: title,
            title,
            profile: { default: true },
            containerIDs: ["pinned", `${title}-pinned`],
          })),
          items: titles.flatMap((title) => [
            {
              id: `${title}-pinned`,
              childrenIds: [`${title}-tab`],
              data: { itemContainer: { containerType: { spaceItems: { _0: title } } } },
            },
            {
              id: `${title}-tab`,
              childrenIds: [],
              data: { tab: { savedURL: `https://${title.toLowerCase()}.example/` } },
            },
          ]),
        },
      ],
    },
  })

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

describe("choosing what to import from Arc", () => {
  const ready = () => preview("Ready to import from Arc")

  it("lists the Arc Spaces by profile, all chosen, when the file has more than one profile", async () => {
    renderImport()
    await chooseArcFile()
    const region = await ready()

    expect({
      defaultProfile: checkboxesIn(within(region).getByRole("group", { name: "Default profile" })),
      profile1: checkboxesIn(within(region).getByRole("group", { name: "Profile 1" })),
    }).toStrictEqual({
      defaultProfile: [
        { name: "Default profile", checked: true },
        { name: "Work", checked: true },
        { name: "Reading", checked: true },
        { name: "Untitled Space", checked: true },
      ],
      profile1: [
        { name: "Profile 1", checked: true },
        { name: "Personal", checked: true },
      ],
    })
  })

  it("leaving a Space out updates the counts, and leaves it and its profile's Favorites out of the import", async () => {
    const { requests, finished } = renderImport()
    await chooseArcFile()
    const region = await ready()

    await fireEvent.click(checkbox("Personal"))

    await waitFor(() =>
      expect(listedUnder(region, "To be added")).toStrictEqual([
        "3 Spaces",
        "7 pinned tabs",
        "2 folders",
        "2 split views",
        "2 Favorites",
      ]),
    )
    await fireEvent.click(importButton())
    await waitFor(() => expect(finished).toStrictEqual([true]))
    const { document } = await appliedDocument(requests)
    expect({
      spaces: document.spaces.map(({ name }) => name),
      favorites: document.favorites.map(({ url }) => url),
    }).toStrictEqual({
      spaces: ["Work", "Reading", ""],
      favorites: ["https://calendar.example.com/", "https://music.example.com/"],
    })
  })

  it("leaving out a whole profile leaves out each of its Spaces", async () => {
    renderImport()
    await chooseArcFile()
    const region = await ready()

    await fireEvent.click(checkbox("Default profile"))

    await waitFor(() =>
      expect(listedUnder(region, "To be added")).toStrictEqual([
        "1 Space",
        "2 pinned tabs",
        "1 folder",
        "2 Favorites",
      ]),
    )
    expect(
      ["Work", "Reading", "Untitled Space", "Personal"].map((name) => checkbox(name).checked),
    ).toStrictEqual([false, false, false, true])
  })

  it("shows a profile with some of its Spaces left out as partly chosen, and choosing it chooses them all again", async () => {
    renderImport()
    await chooseArcFile()
    await ready()

    await fireEvent.click(checkbox("Work"))
    const partly = {
      checked: checkbox("Default profile").checked,
      indeterminate: checkbox("Default profile").indeterminate,
    }
    await fireEvent.click(checkbox("Default profile"))

    expect({
      partly,
      again: ["Default profile", "Work", "Reading", "Untitled Space"].map((name) => ({
        checked: checkbox(name).checked,
        indeterminate: checkbox(name).indeterminate,
      })),
    }).toStrictEqual({
      partly: { checked: false, indeterminate: true },
      again: Array.from({ length: 4 }, () => ({ checked: true, indeterminate: false })),
    })
  })

  it("with no Space chosen, asks for one and can't import", async () => {
    renderImport()
    await chooseArcFile()
    const region = await ready()

    await fireEvent.click(checkbox("Default profile"))
    await fireEvent.click(checkbox("Profile 1"))

    await waitFor(() =>
      expect(within(region).getByText("Choose at least one Space to import.")).toBeTruthy(),
    )
    expect([
      within(region).queryByRole("list", { name: "To be added" }),
      importButton().disabled,
    ]).toStrictEqual([null, true])
  })

  it("offers separate Spaces, chosen at first, or combining them into one Space named Arc", async () => {
    renderImport()
    await chooseArcFile()
    const region = await ready()

    const arrangement = within(region).getByRole("group", { name: "How to add them" })
    const radio = (name: string) =>
      within(arrangement).getByRole<HTMLInputElement>("radio", { name })

    expect({
      separate: radio("Separate Spaces").checked,
      combined: radio("Combine into one Space").checked,
    }).toStrictEqual({ separate: true, combined: false })
    expect(
      within(arrangement).getByRole("radio", {
        name: "Combine into one Space",
        description:
          "Adds one Space named Arc, with a folder for each Arc Space. If you already have a Space named Arc, the new one gets a number.",
      }),
    ).toBe(radio("Combine into one Space"))
  })

  it("combining counts one Space with a folder for each Arc Space, and the folders flattened to fit, and imports one Space named Arc", async () => {
    const { requests, finished } = renderImport()
    await chooseArcFile()
    const region = await ready()

    await fireEvent.click(screen.getByRole("radio", { name: "Combine into one Space" }))

    await waitFor(() =>
      expect(listedUnder(region, "To be added")).toStrictEqual([
        "1 Space",
        "9 pinned tabs",
        "6 folders",
        "2 split views",
        "3 Favorites",
      ]),
    )
    expect(listedUnder(region, "Changed to fit Katip")[0]).toBe(
      "2 folders are nested deeper than Katip allows, so their contents go into the folder above them.",
    )
    await fireEvent.click(importButton())
    await waitFor(() => expect(finished).toStrictEqual([true]))
    const { document, spacesNamedByImport } = await appliedDocument(requests)
    expect({
      spaces: document.spaces.map(({ name }) => name),
      folders: document.spaces[0]?.pinned.map((node) => node.type === "folder" && node.title),
      spacesNamedByImport,
    }).toStrictEqual({
      spaces: ["Arc"],
      folders: ["Work", "Reading", "", "Personal"],
      spacesNamedByImport: [document.spaces[0]?.id],
    })
  })

  it("keeps opening Favorites as set when the choice changes", async () => {
    renderImport()
    await chooseArcFile()
    const region = await ready()

    await fireEvent.click(screen.getByRole("switch", { name: "Open Favorites as pinned tabs" }))
    await fireEvent.click(checkbox("Work"))
    await waitFor(() => expect(listedUnder(region, "To be added")[0]).toBe("3 Spaces"))

    expect(
      screen.getByRole<HTMLInputElement>("switch", { name: "Open Favorites as pinned tabs" })
        .checked,
    ).toBe(false)
  })

  it("says the Favorites opened are only those of the chosen Spaces' profiles", async () => {
    renderImport()
    await chooseArcFile()
    await ready()

    expect(
      screen.getByRole("switch", {
        description:
          "They open in this window, after the Favorites you have. Only Favorites from the profiles of the Spaces you chose are opened.",
      }),
    ).toBeTruthy()
  })

  it("says only new Spaces are added, and nothing already there is renamed, merged into, or removed", async () => {
    renderImport()
    await chooseArcFile()
    const region = await ready()

    expect(
      within(region).getByText(
        "Only new Spaces are added. None of your Spaces are renamed, merged into, or removed.",
      ),
    ).toBeTruthy()
  })

  it("lists the Spaces of a file with a single profile without grouping them", async () => {
    renderImport()
    await chooseArcFile(defaultProfileFile(["Home", "Work"]))
    const region = await ready()

    expect({
      profileGroup: within(region).queryByRole("group", { name: "Default profile" }),
      spaces: checkboxesIn(within(region).getByRole("group", { name: "Spaces to import" })),
    }).toStrictEqual({
      profileGroup: null,
      spaces: [
        { name: "Home", checked: true },
        { name: "Work", checked: true },
      ],
    })
  })

  it.each([
    ["Arc's file with a single Space", () => chooseArcFile(defaultProfileFile(["Home"]))],
    ["a Katip file", () => chooseKatipFile()],
  ])("offers no choice of Spaces for %s", async (_, chooseFile) => {
    renderImport()

    await chooseFile()
    const region = await preview(/^Ready to import/)

    expect([
      within(region).queryByRole("group", { name: "Spaces to import" }),
      within(region).queryByRole("group", { name: "How to add them" }),
    ]).toStrictEqual([null, null])
  })
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
