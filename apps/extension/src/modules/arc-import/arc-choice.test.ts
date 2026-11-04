import { Result } from "effect"
import { describe, expect, it } from "vitest"
import { planImport } from "#modules/import"
import {
  arcImportOf,
  COMBINED_SPACE_NAME,
  profileGroupsOf,
  wholeSidebar,
  type ArcArrangement,
} from "./arc-choice"
import { ArcProfile } from "./arc-sidebar"
import { convertArcSidebar, type ArcConversion } from "./arc-to-export"
import arcSidebar from "./fixtures/arc-sidebar.json?raw"

const conversion = Result.getOrThrow(convertArcSidebar(arcSidebar, Date.UTC(2026, 10, 2)))

const choose = (
  spaceIds: ReadonlyArray<string>,
  arrangement: ArcArrangement = "Separate",
  from: ArcConversion = conversion,
) => arcImportOf(from, { spaceIds: new Set(spaceIds), arrangement })

const ALL_SPACES = ["space-work", "space-reading", "space-untitled", "space-personal"]

const twoLevels = { isTabGroupSyncEnabled: false }
const oneLevel = { isTabGroupSyncEnabled: true }

const summaryOf = (document: ReturnType<typeof choose>["document"], rule = twoLevels) =>
  planImport(document, { rule, savedFavoriteUrls: new Set() }).summary

describe("wholeSidebar", () => {
  it("chooses every Arc Space, each as a Space of its own", () => {
    expect(wholeSidebar(conversion)).toStrictEqual({
      spaceIds: new Set(ALL_SPACES),
      arrangement: "Separate",
    })
  })
})

describe("arcImportOf", () => {
  describe("choosing Spaces", () => {
    it("imports only the chosen Spaces, in Arc's order whatever the order they were chosen in", () => {
      const { document } = choose(["space-personal", "space-work"])

      expect(document.spaces.map(({ name }) => name)).toStrictEqual(["Work", "Personal"])
    })

    it("counts what's left out or changed in the chosen Spaces only", () => {
      expect([choose(["space-work"]).report, choose(["space-reading"]).report]).toStrictEqual([
        {
          nonWebLinks: 2,
          widerSplits: 1,
          unsupportedItems: 1,
          spacesWithoutTheme: [],
          spacesNamedByImport: [],
        },
        {
          nonWebLinks: 1,
          widerSplits: 0,
          unsupportedItems: 0,
          spacesWithoutTheme: [],
          spacesNamedByImport: [],
        },
      ])
    })

    it("names a chosen Space without a theme for Katip to pick one", () => {
      expect(choose(["space-untitled", "space-personal"]).report.spacesWithoutTheme).toStrictEqual([
        "space-untitled",
      ])
    })

    it("with nothing chosen, imports no Space and no Favorite", () => {
      const { document, report } = choose([])

      expect([document.spaces, document.favorites, report.nonWebLinks]).toStrictEqual([[], [], 0])
    })
  })

  describe("Favorites", () => {
    const favoriteUrls = (spaceIds: ReadonlyArray<string>) =>
      choose(spaceIds).document.favorites.map(({ url }) => url)

    it("come with any chosen Space of their profile", () => {
      expect({
        defaultProfile: favoriteUrls(["space-reading"]),
        profile1: favoriteUrls(["space-personal"]),
      }).toStrictEqual({
        defaultProfile: ["https://calendar.example.com/", "https://music.example.com/"],
        profile1: ["https://photos.example.com/", "https://calendar.example.com/"],
      })
    })

    it("from several profiles are listed each page once", () => {
      expect(favoriteUrls(["space-work", "space-personal"])).toStrictEqual([
        "https://calendar.example.com/",
        "https://music.example.com/",
        "https://photos.example.com/",
      ])
    })

    it("left behind with their profile aren't counted as left out for not being web pages", () => {
      expect([
        choose(["space-reading"]).report.nonWebLinks,
        choose(["space-personal"]).report.nonWebLinks,
      ]).toStrictEqual([1, 0])
    })

    it("of a profile with no Space in the file come with any chosen Space", () => {
      const orphaned: ArcConversion = {
        ...conversion,
        favorites: [
          {
            profile: ArcProfile.Custom({ directory: "Profile 9" }),
            links: [{ title: "Lone", url: "https://lone.example/" }],
            tally: { nonWebLinks: 0, widerSplits: 0, unsupportedItems: 0 },
          },
        ],
      }

      expect([
        choose(["space-personal"], "Separate", orphaned).document.favorites,
        choose([], "Separate", orphaned).document.favorites,
      ]).toStrictEqual([[{ title: "Lone", url: "https://lone.example/" }], []])
    })
  })

  describe("combining into one Space", () => {
    it("makes one Space named Arc with a folder for each chosen Space, in Arc's order, holding its pinned entries", () => {
      const { document } = choose(["space-personal", "space-reading"], "Combined")
      const [reading, personal] = [conversion.spaces[1]?.space, conversion.spaces[3]?.space]

      expect(
        document.spaces.map(({ name, pinned, tabs }) => ({ name, pinned, tabs })),
      ).toStrictEqual([
        {
          name: COMBINED_SPACE_NAME,
          pinned: [
            { type: "folder", title: "Reading", icon: null, children: reading?.pinned },
            { type: "folder", title: "Personal", icon: null, children: personal?.pinned },
          ],
          tabs: [...(reading?.tabs ?? []), ...(personal?.tabs ?? [])],
        },
      ])
      expect(COMBINED_SPACE_NAME).toBe("Arc")
    })

    it("gives the combined Space the first chosen Space's theme", () => {
      const { document } = choose(["space-personal", "space-reading"], "Combined")

      expect(document.spaces[0]?.theme).toStrictEqual(conversion.spaces[1]?.space.theme)
    })

    it("names the combined Space as the import's suggestion, to number if it's taken", () => {
      const { document, report } = choose(ALL_SPACES, "Combined")

      expect(report.spacesNamedByImport).toStrictEqual([document.spaces[0]?.id])
    })

    it("leaves the theme to Katip when the first chosen Space has none", () => {
      const { document, report } = choose(["space-untitled", "space-personal"], "Combined")

      expect(report.spacesWithoutTheme).toStrictEqual([document.spaces[0]?.id])
    })

    it("keeps the Favorites and what's left out or changed as when importing them separately", () => {
      const combined = choose(ALL_SPACES, "Combined")
      const separate = choose(ALL_SPACES, "Separate")

      expect({
        favorites: combined.document.favorites,
        nonWebLinks: combined.report.nonWebLinks,
        widerSplits: combined.report.widerSplits,
        unsupportedItems: combined.report.unsupportedItems,
      }).toStrictEqual({
        favorites: separate.document.favorites,
        nonWebLinks: separate.report.nonWebLinks,
        widerSplits: separate.report.widerSplits,
        unsupportedItems: separate.report.unsupportedItems,
      })
    })

    it("with nothing chosen, makes no Space", () => {
      expect(choose([], "Combined").document.spaces).toStrictEqual([])
    })

    it("puts every folder one level deeper, so one more nested folder is flattened to fit Katip", () => {
      expect({
        separate: summaryOf(choose(ALL_SPACES, "Separate").document),
        combined: summaryOf(choose(ALL_SPACES, "Combined").document),
      }).toStrictEqual({
        separate: expect.objectContaining({ spaces: 4, folders: 3, flattenedFolders: 1 }),
        combined: expect.objectContaining({ spaces: 1, folders: 6, flattenedFolders: 2 }),
      })
    })

    it("while tab groups are synced, keeps only the folders for the Spaces and flattens all inside them", () => {
      expect(summaryOf(choose(ALL_SPACES, "Combined").document, oneLevel)).toStrictEqual(
        expect.objectContaining({ folders: 4, flattenedFolders: 4 }),
      )
    })
  })
})

describe("profileGroupsOf", () => {
  it("groups the Spaces by profile, in the order Arc first lists a Space of each", () => {
    expect(
      profileGroupsOf(conversion.spaces).map(({ profile, spaces }) => ({
        profile,
        names: spaces.map(({ space }) => space.name),
      })),
    ).toStrictEqual([
      { profile: ArcProfile.Default(), names: ["Work", "Reading", ""] },
      { profile: ArcProfile.Custom({ directory: "Profile 1" }), names: ["Personal"] },
    ])
  })
})
