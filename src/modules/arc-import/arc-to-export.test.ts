import { Result } from "effect"
import { describe, expect, it } from "vitest"
import { decodeExportFile, encodeExportFile } from "#modules/export"
import { NotArcSidebar } from "./arc-sidebar"
import { arcSidebarToExport, type ArcImport } from "./arc-to-export"
import arcSidebar from "./fixtures/arc-sidebar.json?raw"

const CONVERTED_AT = Date.UTC(2026, 10, 2, 3, 4, 5)

const convert = (content: string): ArcImport =>
  Result.getOrThrow(arcSidebarToExport(content, CONVERTED_AT))

type ItemDraft = Readonly<Record<string, unknown>> & { readonly id: string }

const tab = (
  id: string,
  url: string,
  { title = null, savedTitle = "" }: { title?: string | null; savedTitle?: string } = {},
): ItemDraft => ({ id, title, childrenIds: [], data: { tab: { savedURL: url, savedTitle } } })

const folder = (id: string, title: string, childrenIds: ReadonlyArray<string>): ItemDraft => ({
  id,
  title,
  childrenIds,
  data: { list: {} },
})

const splitView = (id: string, childrenIds: ReadonlyArray<string>): ItemDraft => ({
  id,
  title: null,
  childrenIds,
  data: { splitView: { layoutOrientation: "horizontal" } },
})

const container = (id: string, childrenIds: ReadonlyArray<string>): ItemDraft => ({
  id,
  title: null,
  childrenIds,
  data: { itemContainer: { containerType: { spaceItems: { _0: "space" } } } },
})

/** An Arc Space listing its containers the older way, as string labels. */
const space = (
  id: string,
  title: string,
  extra: Readonly<Record<string, unknown>> = {},
): ItemDraft => ({
  id,
  title,
  containerIDs: ["pinned", `${id}-pinned`, "unpinned", `${id}-today`],
  ...extra,
})

const arcFile = ({
  spaces,
  items,
  favorites = [],
}: {
  spaces: ReadonlyArray<ItemDraft>
  items: ReadonlyArray<ItemDraft>
  favorites?: ReadonlyArray<string>
}) =>
  JSON.stringify({
    version: 1,
    sidebar: {
      containers: [
        { global: {} },
        {
          spaces: spaces.flatMap((entry) => [entry.id, entry]),
          items: [
            ...items,
            {
              id: "favorites",
              title: null,
              childrenIds: favorites,
              data: { itemContainer: { containerType: { topApps: { _0: { default: {} } } } } },
            },
          ].flatMap((entry) => [entry.id, entry]),
          topAppsContainerIDs: [{ default: {} }, "favorites"],
        },
      ],
    },
  })

/** A file with one Space, "Home", whose pinned entries are `pinnedIds` among `items`. */
const homeWith = (pinnedIds: ReadonlyArray<string>, items: ReadonlyArray<ItemDraft>) =>
  arcFile({
    spaces: [space("home", "Home")],
    items: [container("home-pinned", pinnedIds), container("home-today", []), ...items],
  })

const pinnedOfHome = (content: string) => convert(content).document.spaces[0]?.pinned

describe("arcSidebarToExport", () => {
  it("turns each Arc Space into a Space with its pinned tabs, folders and split views in order", () => {
    const { document } = convert(arcSidebar)

    expect(
      document.spaces.map(({ id, name, pinned, tabs }) => ({ id, name, pinned, tabs })),
    ).toStrictEqual([
      {
        id: "space-work",
        name: "Work",
        pinned: [
          { type: "pin", title: "Inbox", url: "https://mail.example.com/inbox" },
          {
            type: "folder",
            title: "Projects",
            icon: null,
            children: [
              { type: "pin", title: "Roadmap – Docs", url: "https://docs.example.com/roadmap" },
              {
                type: "folder",
                title: "Archive",
                icon: null,
                children: [
                  {
                    type: "folder",
                    title: "2025",
                    icon: null,
                    children: [
                      {
                        type: "pin",
                        title: "2025 Review",
                        url: "https://docs.example.com/2025-review",
                      },
                    ],
                  },
                ],
              },
              {
                type: "split",
                items: [
                  { type: "pin", title: "Board", url: "https://tracker.example.com/board" },
                  { type: "pin", title: "Team Chat", url: "https://chat.example.com/team" },
                ],
              },
            ],
          },
          {
            type: "split",
            items: [
              { type: "pin", title: "Design", url: "https://design.example.com/file" },
              { type: "pin", title: "Spec", url: "https://docs.example.com/spec" },
            ],
          },
          { type: "pin", title: "Prototype", url: "https://proto.example.com/latest" },
          { type: "pin", title: "status.example.com", url: "https://status.example.com/" },
        ],
        tabs: [
          { title: "Today’s News", url: "https://news.example.com/today" },
          {
            title: "effect schema – Search",
            url: "https://search.example.com/?q=effect+schema",
          },
        ],
      },
      {
        id: "space-reading",
        name: "Reading",
        pinned: [{ type: "pin", title: "Long Read", url: "https://blog.example.com/long-read" }],
        tabs: [],
      },
      {
        id: "space-untitled",
        name: "",
        pinned: [{ type: "pin", title: "Weather", url: "https://weather.example.com/" }],
        tabs: [],
      },
    ])
  })

  it("turns Arc's Favorites into Favorites, keeping only web pages", () => {
    expect(convert(arcSidebar).document.favorites).toStrictEqual([
      { title: "Calendar", url: "https://calendar.example.com/" },
      { title: "Music", url: "https://music.example.com/" },
    ])
  })

  it("reports what it left out or changed", () => {
    expect(convert(arcSidebar).report).toStrictEqual({
      nonWebLinks: 2,
      widerSplits: 1,
      unsupportedItems: 1,
      spacesWithoutTheme: ["space-untitled"],
    })
  })

  it("writes a document of the latest version that Katip's reader reads back unchanged", () => {
    const { document } = convert(arcSidebar)

    const readBack = decodeExportFile(Result.getOrThrow(encodeExportFile(document)))

    expect(Result.getOrThrow(readBack)).toStrictEqual(document)
  })

  it("marks the document as converted from Arc at the given time", () => {
    const { document } = convert(arcSidebar)

    expect([document.generator, document.exportedAt]).toStrictEqual([
      { name: "Arc", version: "1" },
      "2026-11-02T03:04:05.000Z",
    ])
  })

  describe("pin titles", () => {
    it("uses the title given in Arc over the page's saved title", () => {
      const content = homeWith(
        ["a"],
        [tab("a", "https://a.example/", { title: "Given", savedTitle: "Saved" })],
      )

      expect(pinnedOfHome(content)).toStrictEqual([
        { type: "pin", title: "Given", url: "https://a.example/" },
      ])
    })

    it("uses the saved title when no title was given or it is blank", () => {
      const content = homeWith(
        ["a", "b"],
        [
          tab("a", "https://a.example/", { title: null, savedTitle: "Saved A" }),
          tab("b", "https://b.example/", { title: "  ", savedTitle: "Saved B" }),
        ],
      )

      expect(pinnedOfHome(content)?.map((node) => node.type === "pin" && node.title)).toStrictEqual(
        ["Saved A", "Saved B"],
      )
    })

    it("falls back to the address's host when there's no title at all", () => {
      const content = homeWith(["a"], [tab("a", "https://docs.example:8443/page")])

      expect(pinnedOfHome(content)).toStrictEqual([
        { type: "pin", title: "docs.example:8443", url: "https://docs.example:8443/page" },
      ])
    })
  })

  describe("split views", () => {
    const pageTab = (id: string) => tab(id, `https://${id}.example/`)
    const tabs = ["a", "b", "c", "d"].map(pageTab)

    it("turns a split view of two tabs into a split pin, left to right", () => {
      const content = homeWith(["split"], [splitView("split", ["a", "b"]), ...tabs])

      expect(pinnedOfHome(content)).toStrictEqual([
        {
          type: "split",
          items: [
            { type: "pin", title: "a.example", url: "https://a.example/" },
            { type: "pin", title: "b.example", url: "https://b.example/" },
          ],
        },
      ])
    })

    it("keeps the first two of a wider split view split, and puts the rest right after as pins", () => {
      const content = homeWith(
        ["split", "after"],
        [splitView("split", ["a", "b", "c", "d"]), tab("after", "https://after.example/"), ...tabs],
      )

      expect(pinnedOfHome(content)?.map((node) => node.type)).toStrictEqual([
        "split",
        "pin",
        "pin",
        "pin",
      ])
      expect(convert(content).report.widerSplits).toBe(1)
    })

    it("turns a split view with one web page left into a plain pin", () => {
      const content = homeWith(
        ["split"],
        [splitView("split", ["a", "local"]), pageTab("a"), tab("local", "file:///x")],
      )

      expect(pinnedOfHome(content)).toStrictEqual([
        { type: "pin", title: "a.example", url: "https://a.example/" },
      ])
    })
  })

  it("keeps folders nested however deep, for the import to fit them to Katip", () => {
    const content = homeWith(
      ["one"],
      [
        folder("one", "One", ["two"]),
        folder("two", "Two", ["three"]),
        folder("three", "Three", ["page"]),
        tab("page", "https://page.example/"),
      ],
    )

    expect(pinnedOfHome(content)).toStrictEqual([
      {
        type: "folder",
        title: "One",
        icon: null,
        children: [
          {
            type: "folder",
            title: "Two",
            icon: null,
            children: [
              {
                type: "folder",
                title: "Three",
                icon: null,
                children: [{ type: "pin", title: "page.example", url: "https://page.example/" }],
              },
            ],
          },
        ],
      },
    ])
  })

  it("skips tabs whose address isn't http or https, and counts them", () => {
    const content = homeWith(
      ["web", "arc", "file", "script", "blank"],
      [
        tab("web", "http://web.example/"),
        tab("arc", "arc://boosts"),
        tab("file", "file:///Users/someone/notes.txt"),
        tab("script", "javascript:alert(1)"),
        tab("blank", ""),
      ],
    )

    const { document, report } = convert(content)

    expect([document.spaces[0]?.pinned, report.nonWebLinks]).toStrictEqual([
      [{ type: "pin", title: "web.example", url: "http://web.example/" }],
      4,
    ])
  })

  it("skips items with no Katip equivalent, such as notes and easels, and counts them", () => {
    const content = homeWith(
      ["note", "easel"],
      [
        { id: "note", title: "Plans", childrenIds: [], data: { arcDocument: { id: "doc" } } },
        { id: "easel", title: "Board", childrenIds: [], data: { easel: {} } },
      ],
    )

    expect([pinnedOfHome(content), convert(content).report.unsupportedItems]).toStrictEqual([[], 2])
  })

  it("finds the pinned entries when the Space lists its containers as labelled objects", () => {
    const content = arcFile({
      spaces: [
        {
          id: "home",
          title: "Home",
          newContainerIDs: [{ unpinned: {} }, "home-today", { pinned: {} }, "home-pinned"],
        },
      ],
      items: [
        container("home-pinned", ["a"]),
        container("home-today", ["b"]),
        tab("a", "https://a.example/"),
        tab("b", "https://b.example/"),
      ],
    })

    const [home] = convert(content).document.spaces

    expect([home?.pinned, home?.tabs]).toStrictEqual([
      [{ type: "pin", title: "a.example", url: "https://a.example/" }],
      [{ title: "b.example", url: "https://b.example/" }],
    ])
  })

  it("turns unpinned (Today) tabs into temporary tabs, including those in split views", () => {
    const content = arcFile({
      spaces: [space("home", "Home")],
      items: [
        container("home-pinned", []),
        container("home-today", ["a", "split"]),
        tab("a", "https://a.example/"),
        splitView("split", ["b", "c"]),
        tab("b", "https://b.example/"),
        tab("c", "https://c.example/"),
      ],
    })

    expect(convert(content).document.spaces[0]?.tabs.map(({ url }) => url)).toStrictEqual([
      "https://a.example/",
      "https://b.example/",
      "https://c.example/",
    ])
  })

  it("lists each Favorite once, however many times Arc lists its page", () => {
    const content = arcFile({
      spaces: [space("home", "Home")],
      items: [
        container("home-pinned", []),
        tab("a", "https://a.example/"),
        tab("again", "https://a.example/"),
      ],
      favorites: ["a", "again"],
    })

    expect(convert(content).document.favorites).toStrictEqual([
      { title: "a.example", url: "https://a.example/" },
    ])
  })

  it("doesn't loop when an item is listed among its own descendants", () => {
    const content = homeWith(
      ["outer"],
      [folder("outer", "Outer", ["inner"]), folder("inner", "Inner", ["outer"])],
    )

    expect(pinnedOfHome(content)).toStrictEqual([
      {
        type: "folder",
        title: "Outer",
        icon: null,
        children: [{ type: "folder", title: "Inner", icon: null, children: [] }],
      },
    ])
  })

  it("finds the sidebar's Spaces whichever container holds them", () => {
    const content = JSON.stringify({
      sidebar: {
        containers: [
          { spaces: [space("home", "Home")], items: [container("home-pinned", [])] },
          { global: {} },
        ],
      },
    })

    expect(convert(content).document.spaces.map(({ name }) => name)).toStrictEqual(["Home"])
  })

  it("reads past fields it doesn't know and skips entries without the expected shape", () => {
    const content = arcFile({
      spaces: [
        space("home", "Home", { futureField: { nested: [1, 2, 3] } }),
        { id: "broken", title: 42 },
      ],
      items: [
        container("home-pinned", ["a", "broken-item"]),
        { ...tab("a", "https://a.example/"), futureField: true },
        { id: "broken-item", childrenIds: "not a list" },
      ],
    })

    const { document } = convert(content)

    expect(document.spaces.map(({ name, pinned }) => ({ name, pinned }))).toStrictEqual([
      { name: "Home", pinned: [{ type: "pin", title: "a.example", url: "https://a.example/" }] },
    ])
  })

  describe("Space themes", () => {
    it("takes the gradient's base colors, intensity and noise", () => {
      const [work] = convert(arcSidebar).document.spaces

      expect(work?.theme).toStrictEqual({
        mode: "auto",
        colors: [
          { hue: expect.closeTo(264.57, 1), chroma: 1 },
          { hue: expect.closeTo(306.93, 1), chroma: expect.closeTo(0.477, 2) },
        ],
        intensity: 0.5,
        grain: 0.3,
      })
    })

    it("falls back to the palette's main color when there's no gradient", () => {
      const reading = convert(arcSidebar).document.spaces[1]

      expect(reading?.theme).toStrictEqual({
        mode: "auto",
        colors: [{ hue: expect.closeTo(149.24, 1), chroma: expect.closeTo(0.862, 2) }],
        intensity: 0.7,
        grain: 0.2,
      })
    })

    it("keeps one color when the gradient repeats it", () => {
      const color = { red: 0.9, green: 0.4, blue: 0.2, alpha: 1, colorSpace: "extendedSRGB" }
      const content = arcFile({
        spaces: [
          space("home", "Home", {
            customInfo: {
              windowTheme: {
                background: {
                  single: {
                    _0: {
                      style: {
                        color: { _0: { blendedGradient: { _0: { baseColors: [color, color] } } } },
                      },
                    },
                  },
                },
              },
            },
          }),
        ],
        items: [container("home-pinned", [])],
      })

      expect(convert(content).document.spaces[0]?.theme.colors).toHaveLength(1)
    })

    it("reports a Space without a theme, leaving a colorless placeholder in the document", () => {
      const { document, report } = convert(arcSidebar)

      expect([document.spaces[2]?.theme.colors, report.spacesWithoutTheme]).toStrictEqual([
        [],
        ["space-untitled"],
      ])
    })
  })

  describe("files that aren't Arc's sidebar file", () => {
    it.each([
      ["text that isn't JSON", "StorableSidebar"],
      ["JSON without a sidebar", JSON.stringify({ version: 1, spaces: [] })],
      ["a sidebar without Spaces", JSON.stringify({ sidebar: { containers: [{ global: {} }] } })],
      [
        "a Katip export file",
        JSON.stringify({ format: "katip.export", version: 1, spaces: [], favorites: [] }),
      ],
    ])("refuses %s", (_, content) => {
      expect(arcSidebarToExport(content, CONVERTED_AT)).toStrictEqual(
        Result.fail(new NotArcSidebar()),
      )
    })
  })
})
