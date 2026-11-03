import { Result } from "effect"
import { describe, expect, it } from "vitest"
import { decodeExportFile, encodeExportFile } from "#modules/export"
import { themeColorOfSrgb } from "#modules/theme"
import { arcImportOf, wholeSidebar, type ArcImport } from "./arc-choice"
import { ArcProfile, NotArcSidebar } from "./arc-sidebar"
import { convertArcSidebar, type ArcConversion } from "./arc-to-export"
import arcSidebar from "./fixtures/arc-sidebar.json?raw"

const CONVERTED_AT = Date.UTC(2026, 10, 2, 3, 4, 5)

const conversionOf = (content: string): ArcConversion =>
  Result.getOrThrow(convertArcSidebar(content, CONVERTED_AT))

/** Everything in the file, each Arc Space as a Space of its own. */
const convert = (content: string): ArcImport => {
  const conversion = conversionOf(content)
  return arcImportOf(conversion, wholeSidebar(conversion))
}

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

const favoritesContainer = (
  id: string,
  childrenIds: ReadonlyArray<string>,
  profile: unknown,
): ItemDraft => ({
  id,
  title: null,
  childrenIds,
  data: { itemContainer: { containerType: { topApps: { _0: profile } } } },
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

const DEFAULT_PROFILE = { default: {} }

const arcFile = ({
  spaces,
  items,
  favorites = [],
  topAppsContainerIDs = [DEFAULT_PROFILE, "favorites"],
}: {
  spaces: ReadonlyArray<ItemDraft>
  items: ReadonlyArray<ItemDraft>
  favorites?: ReadonlyArray<string>
  topAppsContainerIDs?: ReadonlyArray<unknown>
}) =>
  JSON.stringify({
    version: 1,
    sidebar: {
      containers: [
        { global: {} },
        {
          spaces: spaces.flatMap((entry) => [entry.id, entry]),
          items: [...items, favoritesContainer("favorites", favorites, DEFAULT_PROFILE)].flatMap(
            (entry) => [entry.id, entry],
          ),
          topAppsContainerIDs,
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

describe("convertArcSidebar", () => {
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
      {
        id: "space-personal",
        name: "Personal",
        pinned: [
          { type: "pin", title: "Recipes", url: "https://recipes.example.com/" },
          {
            type: "folder",
            title: "Trips",
            icon: null,
            children: [
              { type: "pin", title: "Packing List", url: "https://packing.example.com/list" },
            ],
          },
        ],
        tabs: [{ title: "Forecast", url: "https://weather.example.com/week" }],
      },
    ])
  })

  it("turns the Favorites of every profile into Favorites, keeping only web pages, each page once", () => {
    expect(convert(arcSidebar).document.favorites).toStrictEqual([
      { title: "Calendar", url: "https://calendar.example.com/" },
      { title: "Music", url: "https://music.example.com/" },
      { title: "Photos", url: "https://photos.example.com/" },
    ])
  })

  it("reports what it left out or changed", () => {
    expect(convert(arcSidebar).report).toStrictEqual({
      nonWebLinks: 2,
      widerSplits: 1,
      unsupportedItems: 1,
      spacesWithoutTheme: ["space-untitled"],
      spacesNamedByImport: [],
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

  it("reads a Space listed twice under the same ID once", () => {
    const content = arcFile({
      spaces: [space("home", "Home"), space("home", "Home again")],
      items: [container("home-pinned", [])],
    })

    expect(conversionOf(content).spaces.map(({ space }) => space.name)).toStrictEqual(["Home"])
  })

  describe("profiles", () => {
    const profileOfSpaceWith = (profile: unknown) =>
      conversionOf(
        arcFile({
          spaces: [space("home", "Home", profile === undefined ? {} : { profile })],
          items: [container("home-pinned", [])],
        }),
      ).spaces[0]?.profile

    it("knows which profile each of the file's Spaces belongs to", () => {
      expect(conversionOf(arcSidebar).spaces.map(({ profile }) => profile)).toStrictEqual([
        ArcProfile.Default(),
        ArcProfile.Default(),
        ArcProfile.Default(),
        ArcProfile.Custom({ directory: "Profile 1" }),
      ])
    })

    it.each([
      ["an empty object", { default: {} }],
      ["true", { default: true }],
      ["a plain label", "default"],
    ])("reads the default profile labelled with %s", (_, profile) => {
      expect(profileOfSpaceWith(profile)).toStrictEqual(ArcProfile.Default())
    })

    it.each([
      ["wrapped", { custom: { _0: { directoryBasename: "Profile 2" } } }],
      ["unwrapped", { custom: { directoryBasename: "Profile 2" } }],
      ["as a bare name", { custom: "Profile 2" }],
      ["wrapped as a bare name", { custom: { _0: "Profile 2" } }],
    ])("reads another profile by its folder's name, %s", (_, profile) => {
      expect(profileOfSpaceWith(profile)).toStrictEqual(
        ArcProfile.Custom({ directory: "Profile 2" }),
      )
    })

    it.each([
      ["no profile", undefined],
      ["a profile of a kind it doesn't know", { guest: {} }],
      ["another profile without a folder's name", { custom: { _0: { name: 7 } } }],
      ["another profile with a blank folder's name", { custom: { directoryBasename: " " } }],
    ])("tells apart no profile for a Space with %s", (_, profile) => {
      expect(profileOfSpaceWith(profile)).toStrictEqual(ArcProfile.Unknown())
    })

    it("keeps each profile's Favorites apart, each page once within a profile", () => {
      expect(
        conversionOf(arcSidebar).favorites.map(({ profile, links }) => ({
          profile,
          urls: links.map(({ url }) => url),
        })),
      ).toStrictEqual([
        {
          profile: ArcProfile.Default(),
          urls: ["https://calendar.example.com/", "https://music.example.com/"],
        },
        {
          profile: ArcProfile.Custom({ directory: "Profile 1" }),
          urls: ["https://photos.example.com/", "https://calendar.example.com/"],
        },
      ])
    })

    const favoritesFile = (topAppsContainerIDs: ReadonlyArray<unknown>) =>
      JSON.stringify({
        sidebar: {
          containers: [
            {
              spaces: [space("home", "Home")],
              items: [
                container("home-pinned", []),
                favoritesContainer("mine", ["a"], { default: true }),
                favoritesContainer("theirs", ["b"], { custom: { _0: { directoryBasename: "P" } } }),
                tab("a", "https://a.example/"),
                tab("b", "https://b.example/"),
              ],
              topAppsContainerIDs,
            },
          ],
        },
      })

    it("takes the profile of Favorites from the container's type when the label can't be read", () => {
      const content = favoritesFile([{ unknownLabel: {} }, "mine", 42, "theirs"])

      expect(conversionOf(content).favorites.map(({ profile }) => profile)).toStrictEqual([
        ArcProfile.Default(),
        ArcProfile.Custom({ directory: "P" }),
      ])
    })

    it("finds each profile's Favorites by their container's type when the file doesn't list them", () => {
      expect(
        conversionOf(favoritesFile([])).favorites.map(({ profile, links }) => [
          profile,
          links.map(({ url }) => url),
        ]),
      ).toStrictEqual([
        [ArcProfile.Default(), ["https://a.example/"]],
        [ArcProfile.Custom({ directory: "P" }), ["https://b.example/"]],
      ])
    })
  })

  describe("Space themes", () => {
    const srgb = (red: number, green: number, blue: number, alpha = 1) => ({
      red,
      green,
      blue,
      alpha,
      colorSpace: "extendedSRGB",
    })
    const transparent = srgb(0, 0, 0, 0)

    const gradientTheme = ({
      baseColors,
      overlayColors = [],
      modifiers = {},
      translucencyStyle,
      contentOverBackgroundAppearance,
    }: {
      baseColors: ReadonlyArray<unknown>
      overlayColors?: ReadonlyArray<unknown>
      modifiers?: Readonly<Record<string, unknown>>
      translucencyStyle?: string
      contentOverBackgroundAppearance?: string
    }) => ({
      windowTheme: {
        background: {
          single: {
            _0: {
              style: {
                color: {
                  _0: {
                    blendedGradient: {
                      _0: { baseColors, overlayColors, modifiers, translucencyStyle },
                    },
                  },
                },
              },
              contentOverBackgroundAppearance,
            },
          },
        },
      },
    })

    const themeOfSpaceWith = (customInfo: unknown) =>
      convert(
        arcFile({
          spaces: [space("home", "Home", { customInfo })],
          items: [container("home-pinned", [])],
        }),
      ).document.spaces[0]?.theme

    const red = srgb(0.9, 0.2, 0.2)
    const blue = srgb(0.2, 0.3, 0.9)

    it("takes the gradient's base colors, and the appearance Arc paints them with", () => {
      const [work] = convert(arcSidebar).document.spaces

      expect(work?.theme).toStrictEqual({
        mode: "dark",
        colors: [
          { hue: expect.closeTo(264.57, 1), chroma: 1 },
          { hue: expect.closeTo(306.93, 1), chroma: expect.closeTo(0.477, 2) },
        ],
        intensity: 0.375,
        grain: 0.15,
      })
    })

    it("falls back to the palette's main color when there's no gradient, following the system's scheme", () => {
      const reading = convert(arcSidebar).document.spaces[1]

      expect(reading?.theme).toStrictEqual({
        mode: "auto",
        colors: [{ hue: expect.closeTo(149.24, 1), chroma: expect.closeTo(0.862, 2) }],
        intensity: 0.7,
        grain: 0.2,
      })
    })

    it("lays an opaque overlay over the base colors, as Arc shows it from top to bottom", () => {
      const theme = themeOfSpaceWith(
        gradientTheme({
          baseColors: [srgb(0.956863, 0.898039, 0.713725), srgb(0.694118, 0.894118, 0.952941)],
          overlayColors: [transparent, srgb(0.807843, 0.733333, 0.964706)],
          modifiers: { overlay: "sand", intensityFactor: 1, noiseFactor: 0.5 },
          translucencyStyle: "light",
          contentOverBackgroundAppearance: "light",
        }),
      )

      expect(theme).toStrictEqual({
        mode: "light",
        colors: [
          { hue: expect.closeTo(92.72, 1), chroma: expect.closeTo(0.188, 2) },
          { hue: expect.closeTo(289.64, 1), chroma: expect.closeTo(0.328, 2) },
          { hue: expect.closeTo(299.32, 1), chroma: expect.closeTo(0.493, 2) },
        ],
        intensity: 0.75,
        grain: 0.25,
      })
    })

    it("shows the overlay's own color where it's fully opaque, and the base color where it's clear", () => {
      const green = srgb(0.2, 0.8, 0.3)

      const theme = themeOfSpaceWith(
        gradientTheme({ baseColors: [red, blue], overlayColors: [transparent, green] }),
      )

      expect({
        top: theme?.colors[0]?.hue,
        bottom: theme?.colors[2],
      }).toStrictEqual({
        top: expect.closeTo(themeColorOfSrgb(red).hue, -1),
        bottom: {
          hue: expect.closeTo(themeColorOfSrgb(green).hue, 2),
          chroma: expect.closeTo(themeColorOfSrgb(green).chroma, 2),
        },
      })
    })

    it("keeps the base colors as they are when the overlay is fully transparent", () => {
      const theme = themeOfSpaceWith(
        gradientTheme({ baseColors: [red, blue], overlayColors: [transparent, transparent] }),
      )

      expect(theme?.colors).toHaveLength(2)
    })

    it("reads channels outside sRGB's range as the nearest color within it", () => {
      const outOfRange = srgb(1.08, 0.42, -0.12)
      const within = srgb(1, 0.42, 0)

      expect([
        themeOfSpaceWith(gradientTheme({ baseColors: [outOfRange, blue] }))?.colors,
        themeOfSpaceWith(
          gradientTheme({ baseColors: [red, blue], overlayColors: [transparent, outOfRange] }),
        )?.colors,
      ]).toStrictEqual([
        themeOfSpaceWith(gradientTheme({ baseColors: [within, blue] }))?.colors,
        themeOfSpaceWith(
          gradientTheme({ baseColors: [red, blue], overlayColors: [transparent, within] }),
        )?.colors,
      ])
    })

    describe("light and dark", () => {
      it.each([
        ["light", "light"],
        ["dark", "dark"],
      ] as const)("follows Arc's %s appearance", (appearance, mode) => {
        expect(
          themeOfSpaceWith(
            gradientTheme({ baseColors: [red], contentOverBackgroundAppearance: appearance }),
          )?.mode,
        ).toBe(mode)
      })

      it("takes the appearance from the translucency style when the gradient doesn't say", () => {
        expect(
          themeOfSpaceWith(gradientTheme({ baseColors: [red], translucencyStyle: "dark" }))?.mode,
        ).toBe("dark")
      })

      it("follows the system's scheme when Arc names neither light nor dark", () => {
        expect(
          themeOfSpaceWith(
            gradientTheme({
              baseColors: [red],
              translucencyStyle: "regular",
              contentOverBackgroundAppearance: "vibrant",
            }),
          )?.mode,
        ).toBe("auto")
      })
    })

    describe("intensity and grain", () => {
      it.each([
        [1, 0.5, { intensity: 0.75, grain: 0.25 }],
        [0.8, 0.8, { intensity: 0.6, grain: 0.4 }],
        [0, 0, { intensity: 0, grain: 0 }],
      ])(
        "scales Arc's intensity %d and noise %d to look alike in Katip",
        (intensityFactor, noiseFactor, expected) => {
          const theme = themeOfSpaceWith(
            gradientTheme({ baseColors: [red], modifiers: { intensityFactor, noiseFactor } }),
          )

          expect({ intensity: theme?.intensity, grain: theme?.grain }).toStrictEqual(expected)
        },
      )

      it("uses Katip's defaults when Arc's are missing or out of range", () => {
        const theme = themeOfSpaceWith(
          gradientTheme({ baseColors: [red], modifiers: { intensityFactor: 1.5 } }),
        )

        expect({ intensity: theme?.intensity, grain: theme?.grain }).toStrictEqual({
          intensity: 0.7,
          grain: 0.2,
        })
      })
    })

    it("keeps one color when the gradient repeats it", () => {
      const color = srgb(0.9, 0.4, 0.2)

      expect(themeOfSpaceWith(gradientTheme({ baseColors: [color, color] }))?.colors).toHaveLength(
        1,
      )
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
      expect(convertArcSidebar(content, CONVERTED_AT)).toStrictEqual(
        Result.fail(new NotArcSidebar()),
      )
    })
  })
})
