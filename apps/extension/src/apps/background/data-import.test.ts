import { describe, expect, it } from "@effect/vitest"
import { Effect, type Layer, Option, Result, Schema, type Scope, Stream } from "effect"
import { arcImportOf, convertArcSidebar, type ArcArrangement } from "#modules/arc-import"
import arcSidebar from "../../modules/arc-import/fixtures/arc-sidebar.json?raw"
import {
  decodeExportFile,
  encodeExportFile,
  exportedSettingsOf,
  type LatestExport,
} from "#modules/export"
import { defaultSettings } from "#modules/settings"
import { groupColorOf, neutralTheme, themeOf } from "#modules/theme"
import { type PortSender } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import {
  EXPORT_PORT_NAME,
  ExportClientMessage,
  ExportServerMessage,
  IMPORT_PORT_NAME,
  ImportClientMessage,
  ImportServerMessage,
} from "#protocol"
import {
  backgroundTestLayer,
  openSidebar,
  spaceNamed,
  startBackground,
} from "./testing/background-harness"

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof backgroundTestLayer> | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(backgroundTestLayer))

type FileSpace = LatestExport["spaces"][number]
type FileNode = FileSpace["pinned"][number]

const pin = (title: string, url: string): Extract<FileNode, { readonly type: "pin" }> => ({
  type: "pin",
  title,
  url,
})

const workTheme = {
  mode: "dark",
  colors: [{ hue: 145, chroma: 0.6 }],
  intensity: 0.4,
  grain: 0,
} as const

const fileSpace = (
  name: string,
  pinned: ReadonlyArray<FileNode>,
  extra: Partial<FileSpace> = {},
): FileSpace => ({
  id: `file-${name}`,
  name,
  theme: workTheme,
  pinned,
  tabs: [],
  ...extra,
})

const fileWith = (
  spaces: ReadonlyArray<FileSpace>,
  favorites: LatestExport["favorites"] = [],
  settings: LatestExport["settings"] = exportedSettingsOf(defaultSettings),
) =>
  Result.getOrThrow(
    encodeExportFile({
      format: "katip.export",
      version: 1,
      exportedAt: "2026-11-02T03:04:05.000Z",
      generator: { name: "Katip", version: "0.1.0" },
      spaces,
      favorites,
      settings,
    }),
  )

const encodeImportRequest = Schema.encodeSync(ImportClientMessage)
const decodeImportReply = Schema.decodeUnknownEffect(ImportServerMessage)

/** Connects as the settings page, sends one import request, and takes the first answer. */
const askToImport = (message: ImportClientMessage, sender?: PortSender) =>
  Effect.gen(function* () {
    const port = yield* (yield* FakeBrowser).connect(IMPORT_PORT_NAME, sender)
    yield* port.post(encodeImportRequest(message))
    const reply = yield* port.messages.pipe(Stream.runHead, Effect.timeout("10 seconds"))
    return yield* Option.match(reply, {
      onNone: () => Effect.die(new Error("disconnected before answering")),
      onSome: decodeImportReply,
    })
  })

const preview = (content: string, sender?: PortSender) =>
  askToImport({ _tag: "Preview", content }, sender)

const apply = (
  content: string,
  options: {
    readonly addFavorites?: boolean
    readonly spacesWithoutTheme?: ReadonlyArray<string>
    readonly spacesNamedByImport?: ReadonlyArray<string>
  } = {},
  sender?: PortSender,
) =>
  askToImport(
    {
      _tag: "Apply",
      content,
      addFavorites: options.addFavorites ?? true,
      spacesWithoutTheme: options.spacesWithoutTheme ?? [],
      spacesNamedByImport: options.spacesNamedByImport ?? [],
    },
    sender,
  )

/** Katip's state as its own export file shows it. */
const exported = Effect.gen(function* () {
  const port = yield* (yield* FakeBrowser).connect(EXPORT_PORT_NAME)
  yield* port.post(Schema.encodeSync(ExportClientMessage)({ _tag: "Export" }))
  const reply = yield* port.messages.pipe(Stream.runHead, Effect.timeout("10 seconds"))
  const answer = yield* Schema.decodeUnknownEffect(ExportServerMessage)(Option.getOrThrow(reply))
  if (answer._tag !== "Exported") return yield* Effect.die(new Error("couldn't export"))
  return Result.getOrThrow(decodeExportFile(answer.content))
}).pipe(Effect.scoped)

/** A window with one tab, the background running, and the first Space holding one pin. */
const startWithHomePin = Effect.gen(function* () {
  const fake = yield* FakeBrowser
  const seeded = yield* fake.seedWindow({
    tabs: [{ url: "https://start.example/", title: "Start" }],
  })
  yield* startBackground
  const sidebar = yield* openSidebar(seeded.windowId)
  const home = (yield* sidebar.viewWhere((view) => view.spaces.length === 1)).activeSpaceId
  yield* sidebar.run({
    _tag: "PlaceTabInPinned",
    tabId: seeded.tabIds[0],
    placement: { spaceId: home, parentId: null, index: 0 },
  })
  return { ...seeded, sidebar, home }
})

const nestedSpace = fileSpace("Work", [
  pin("Inbox", "https://mail.example.com/inbox"),
  {
    type: "folder",
    title: "Projects",
    icon: "star",
    children: [
      pin("Roadmap", "https://docs.example.com/roadmap"),
      {
        type: "folder",
        title: "Archive",
        icon: null,
        children: [
          {
            type: "folder",
            title: "2025",
            icon: null,
            children: [pin("Review", "https://docs.example.com/review")],
          },
        ],
      },
    ],
  },
  {
    type: "split",
    items: [
      pin("Design", "https://design.example.com/file"),
      pin("Spec", "https://docs.example.com/spec"),
    ],
  },
  {
    type: "liveFolder",
    title: "Reviews",
    source: { kind: "github", query: "review-requested" },
    sort: "oldest",
  },
])

describe("data import", () => {
  it.live("previewing counts what importing would add and leave out, and changes nothing", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const { windowId } = yield* fake.seedWindow({
          tabs: [{ url: "https://mail.example.com/", pinned: true }, { url: "https://a.example/" }],
        })
        yield* startBackground
        const sidebar = yield* openSidebar(windowId)
        yield* sidebar.viewWhere((view) => view.spaces.length === 1)
        const before = yield* fake.snapshot
        const content = fileWith(
          [
            { ...nestedSpace, tabs: [{ title: "News", url: "https://news.example/" }] },
            fileSpace("Reading", [pin("Long Read", "https://blog.example.com/long-read")]),
          ],
          [
            { title: "Mail", url: "https://mail.example.com/" },
            { title: "Calendar", url: "https://calendar.example.com/" },
          ],
        )

        const answer = yield* preview(content)

        expect(answer).toStrictEqual({
          _tag: "Previewed",
          summary: {
            spaces: 2,
            pins: 4,
            folders: 2,
            splits: 1,
            liveFolders: 1,
            favorites: 1,
            favoritesAlreadySaved: 1,
            flattenedFolders: 1,
            temporaryTabs: 1,
          },
        })
        expect([(yield* exported).spaces.length, (yield* fake.snapshot).tabs]).toStrictEqual([
          1,
          before.tabs,
        ])
      }),
    ),
  )

  it.live(
    "importing adds the file's Spaces after the existing ones, with their pins, folders, split pins and live folders",
    () =>
      inBackground(
        Effect.gen(function* () {
          yield* startWithHomePin

          const answer = yield* apply(fileWith([nestedSpace]))
          const after = yield* exported

          expect(answer).toStrictEqual({ _tag: "Applied" })
          expect(
            after.spaces.map(({ name, theme, pinned }) => ({ name, theme, pinned })),
          ).toStrictEqual([
            {
              name: "Home",
              theme: after.spaces[0]?.theme,
              pinned: [pin("Start", "https://start.example/")],
            },
            {
              name: "Work",
              theme: workTheme,
              pinned: [
                pin("Inbox", "https://mail.example.com/inbox"),
                {
                  type: "folder",
                  title: "Projects",
                  icon: "star",
                  children: [
                    pin("Roadmap", "https://docs.example.com/roadmap"),
                    {
                      type: "folder",
                      title: "Archive",
                      icon: null,
                      children: [pin("Review", "https://docs.example.com/review")],
                    },
                  ],
                },
                {
                  type: "split",
                  items: [
                    pin("Design", "https://design.example.com/file"),
                    pin("Spec", "https://docs.example.com/spec"),
                  ],
                },
                {
                  type: "liveFolder",
                  title: "Reviews",
                  source: { kind: "github", query: "review-requested" },
                  sort: "oldest",
                },
              ],
            },
          ])
        }),
      ),
  )

  it.live(
    "a Space in the file with the same ID and name as an existing one is added beside it, leaving the existing one as it was",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { sidebar, home } = yield* startWithHomePin
          const before = yield* exported

          yield* apply(
            fileWith([
              fileSpace("Home", [pin("Imported", "https://imported.example/")], { id: home }),
            ]),
          )
          const after = yield* exported
          const view = yield* sidebar.viewWhere((v) => v.spaces.length === 2)

          expect({
            first: after.spaces[0],
            added: after.spaces.slice(1).map(({ name, pinned }) => ({ name, pinned })),
            addedHasNewId: view.spaces[1]?.id !== home,
          }).toStrictEqual({
            first: before.spaces[0],
            added: [{ name: "Home", pinned: [pin("Imported", "https://imported.example/")] }],
            addedHasNewId: true,
          })
        }),
      ),
  )

  describe("Arc's Spaces combined into one", () => {
    const arc = Result.getOrThrow(convertArcSidebar(arcSidebar, Date.UTC(2026, 10, 2)))

    /** Applies the chosen Arc Spaces, arranged as asked, as the settings page sends them. */
    const applyArc = (
      arrangement: ArcArrangement,
      spaceIds: ReadonlyArray<string> = arc.spaces.map(({ space }) => space.id),
    ) => {
      const { document, report } = arcImportOf(arc, { spaceIds: new Set(spaceIds), arrangement })
      return apply(Result.getOrThrow(encodeExportFile(document)), {
        addFavorites: false,
        spacesWithoutTheme: report.spacesWithoutTheme,
        spacesNamedByImport: report.spacesNamedByImport,
      })
    }

    it.live(
      "add exactly one Space, with a folder for each Arc Space, and change nothing already there",
      () =>
        inBackground(
          Effect.gen(function* () {
            const fake = yield* FakeBrowser
            yield* startWithHomePin
            const before = yield* exported
            const tabsBefore = (yield* fake.snapshot).tabs

            const answer = yield* applyArc("Combined", ["space-reading", "space-personal"])
            const after = yield* exported

            expect({
              answer,
              existing: after.spaces.slice(0, before.spaces.length),
              added: after.spaces
                .slice(before.spaces.length)
                .map(({ name, pinned }) => ({ name, pinned })),
              settings: after.settings,
              tabs: (yield* fake.snapshot).tabs,
            }).toStrictEqual({
              answer: { _tag: "Applied" },
              existing: before.spaces,
              added: [
                {
                  name: "Arc",
                  pinned: [
                    {
                      type: "folder",
                      title: "Reading",
                      icon: null,
                      children: [pin("Long Read", "https://blog.example.com/long-read")],
                    },
                    {
                      type: "folder",
                      title: "Personal",
                      icon: null,
                      children: [
                        pin("Recipes", "https://recipes.example.com/"),
                        {
                          type: "folder",
                          title: "Trips",
                          icon: null,
                          children: [pin("Packing List", "https://packing.example.com/list")],
                        },
                      ],
                    },
                  ],
                },
              ],
              settings: before.settings,
              tabs: tabsBefore,
            })
          }),
        ),
    )

    it.live(
      "are named Arc with the next free number when a Space already has the name, which keeps it",
      () =>
        inBackground(
          Effect.gen(function* () {
            yield* startWithHomePin
            yield* apply(fileWith([fileSpace("Arc", [pin("Mine", "https://mine.example/")])]))
            const before = yield* exported

            yield* applyArc("Combined")
            yield* applyArc("Combined")
            const after = yield* exported

            expect({
              existing: after.spaces.slice(0, before.spaces.length),
              names: after.spaces.map(({ name }) => name),
            }).toStrictEqual({
              existing: before.spaces,
              names: ["Home", "Arc", "Arc 2", "Arc 3"],
            })
          }),
        ),
    )
  })

  it.live("settings in the file are left out", () =>
    inBackground(
      Effect.gen(function* () {
        yield* startWithHomePin
        const before = (yield* exported).settings

        yield* apply(
          fileWith([], [], {
            ...exportedSettingsOf(defaultSettings),
            newTabsOnTop: !before.newTabsOnTop,
            syncTabGroups: !before.syncTabGroups,
            locale: "es",
          }),
        )

        expect((yield* exported).settings).toStrictEqual(before)
      }),
    ),
  )

  it.live(
    "while syncing tab groups, the contents of folders inside folders go into the top-level folder",
    () =>
      inBackground(
        Effect.gen(function* () {
          yield* (yield* FakeBrowser).seedStorage("sync", {
            "katip/settings": { syncTabGroups: true },
          })
          yield* startWithHomePin

          yield* apply(fileWith([nestedSpace]))

          expect((yield* exported).spaces[1]?.pinned[1]).toStrictEqual({
            type: "folder",
            title: "Projects",
            icon: "star",
            children: [
              pin("Roadmap", "https://docs.example.com/roadmap"),
              pin("Review", "https://docs.example.com/review"),
            ],
          })
        }),
      ),
  )

  describe("Favorites", () => {
    const favorites = [
      { title: "Mail", url: "https://mail.example.com/" },
      { title: "Calendar", url: "https://calendar.example.com/" },
    ]

    it.live(
      "are added closed after the saved Favorites, skipping pages Favorites already has, and open no tab",
      () =>
        inBackground(
          Effect.gen(function* () {
            const fake = yield* FakeBrowser
            const { windowId } = yield* fake.seedWindow({
              tabs: [{ url: "https://mail.example.com/", title: "Mail", pinned: true }, {}],
            })
            yield* startBackground
            const sidebar = yield* openSidebar(windowId)
            yield* sidebar.viewWhere((view) => view.favorites.length === 1)
            const tabsBefore = (yield* fake.snapshot).tabs.length

            yield* apply(fileWith([], favorites))
            const view = yield* sidebar.viewWhere((v) => v.favorites.length === 2)

            expect([
              view.favorites.map((favorite) => [favorite.title, favorite.openTab !== null]),
              (yield* fake.snapshot).tabs.length,
            ]).toStrictEqual([
              [
                ["Mail", true],
                ["Calendar", false],
              ],
              tabsBefore,
            ])
          }),
        ),
    )

    it.live("with adding Favorites turned off, adds none", () =>
      inBackground(
        Effect.gen(function* () {
          yield* startWithHomePin

          yield* apply(fileWith([], favorites), { addFavorites: false })

          expect((yield* exported).favorites).toStrictEqual([])
        }),
      ),
    )
  })

  it.live(
    "Spaces whose theme is a placeholder get the theme Katip picks for a new Space, each a different color",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { sidebar } = yield* startWithHomePin
          const placeholder = { theme: neutralTheme }

          yield* apply(
            fileWith([
              fileSpace("First", [], { ...placeholder, id: "one" }),
              fileSpace("Second", [], { ...placeholder, id: "two" }),
            ]),
            { spacesWithoutTheme: ["one", "two"] },
          )
          const view = yield* sidebar.viewWhere((v) => v.spaces.length === 3)
          const colorOf = (name: string) =>
            groupColorOf(Option.getOrThrow(spaceNamed(view, name)).theme)

          expect([
            colorOf("First") !== "grey",
            colorOf("Second") !== "grey",
            colorOf("First") !== colorOf("Second"),
          ]).toStrictEqual([true, true, true])
        }),
      ),
  )

  it.live("keeps the file's theme for Spaces not named as placeholders", () =>
    inBackground(
      Effect.gen(function* () {
        const { sidebar } = yield* startWithHomePin
        const theme = themeOf([{ hue: 20.1234, chroma: 0.8 }])

        yield* apply(fileWith([fileSpace("Colored", [], { theme })]))
        const view = yield* sidebar.viewWhere((v) => v.spaces.length === 2)

        expect(Option.getOrThrow(spaceNamed(view, "Colored")).theme.colors).toStrictEqual([
          { hue: 20.123, chroma: 0.8 },
        ])
      }),
    ),
  )

  it.live(
    "names a Space without a name as Katip numbers new Spaces, and an untitled folder as a new folder",
    () =>
      inBackground(
        Effect.gen(function* () {
          yield* startWithHomePin

          yield* apply(
            fileWith([fileSpace("  ", [{ type: "folder", title: "", icon: null, children: [] }])]),
          )
          const added = (yield* exported).spaces[1]

          expect([added?.name, added?.pinned]).toStrictEqual([
            "Space 2",
            [{ type: "folder", title: "New Folder", icon: null, children: [] }],
          ])
        }),
      ),
  )

  it.live("answers content that isn't a Katip export file as unreadable, and changes nothing", () =>
    inBackground(
      Effect.gen(function* () {
        yield* startWithHomePin
        const before = yield* exported

        const answers = [yield* preview('{"sidebar":{"containers":[]}}'), yield* apply("not json")]

        expect([answers, (yield* exported).spaces]).toStrictEqual([
          [{ _tag: "Unreadable" }, { _tag: "Unreadable" }],
          before.spaces,
        ])
      }),
    ),
  )

  it.live("hangs up on another extension without importing", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
        yield* startBackground
        const port = yield* fake.connect(IMPORT_PORT_NAME, {
          external: true,
          url: Option.some("chrome-extension://abcdefghijklmnopabcdefghijklmnop/"),
          origin: Option.some("chrome-extension://abcdefghijklmnopabcdefghijklmnop"),
          tabId: Option.none(),
        })
        yield* port.post(
          encodeImportRequest({
            _tag: "Apply",
            content: fileWith([nestedSpace]),
            addFavorites: true,
            spacesWithoutTheme: [],
            spacesNamedByImport: [],
          }),
        )

        yield* port.disconnected.pipe(Effect.timeout("2 seconds"))
        const received = yield* Stream.runCollect(port.messages)

        expect([received, (yield* exported).spaces.length]).toStrictEqual([[], 1])
      }),
    ),
  )
})
