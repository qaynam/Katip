import { describe, expect, it } from "vitest"
import { exportedSettingsOf, type LatestExport } from "#modules/export"
import { defaultSettings } from "#modules/settings"
import { themeOf } from "#modules/theme"
import { planFavorites, planImport, planSpace } from "./import-plan"

type FileSpace = LatestExport["spaces"][number]
type FileNode = FileSpace["pinned"][number]

const twoLevels = { isTabGroupSyncEnabled: false }
const oneLevel = { isTabGroupSyncEnabled: true }

const theme = themeOf([{ hue: 200, chroma: 0.5 }])

const pin = (title: string): FileNode => ({
  type: "pin",
  title,
  url: `https://${title.toLowerCase()}.example/`,
})

const folder = (title: string, children: ReadonlyArray<FileNode>): FileNode => ({
  type: "folder",
  title,
  icon: null,
  children,
})

const spaceWith = (pinned: ReadonlyArray<FileNode>, tabs: FileSpace["tabs"] = []): FileSpace => ({
  id: "file-space",
  name: "Work",
  theme,
  pinned,
  tabs,
})

const documentWith = (
  spaces: ReadonlyArray<FileSpace>,
  favorites: LatestExport["favorites"] = [],
): LatestExport => ({
  format: "katip.export",
  version: 1,
  exportedAt: "2026-11-02T03:04:05.000Z",
  generator: { name: "Katip", version: "0.1.0" },
  spaces,
  favorites,
  settings: exportedSettingsOf(defaultSettings),
})

describe("planSpace", () => {
  it("keeps the Space's name, theme and pinned entries in order", () => {
    const space = spaceWith([
      pin("Inbox"),
      {
        type: "split",
        items: [
          { type: "pin", title: "Left", url: "https://left.example/" },
          { type: "pin", title: "Right", url: "https://right.example/" },
        ],
      },
      { type: "folder", title: "Reading", icon: "star", children: [pin("Article")] },
      {
        type: "liveFolder",
        title: "Reviews",
        source: { kind: "github", query: "review-requested" },
        sort: "oldest",
      },
      {
        type: "liveFolder",
        title: "Mail",
        source: { kind: "gmail", accountIndex: 1, label: "Work" },
        sort: "newest",
      },
    ])

    expect(planSpace(space, twoLevels)).toStrictEqual({
      fileId: "file-space",
      name: "Work",
      theme,
      pinned: [
        { _tag: "Pin", title: "Inbox", url: "https://inbox.example/" },
        {
          _tag: "Split",
          left: { title: "Left", url: "https://left.example/" },
          right: { title: "Right", url: "https://right.example/" },
        },
        {
          _tag: "Folder",
          title: "Reading",
          icon: "star",
          children: [{ _tag: "Pin", title: "Article", url: "https://article.example/" }],
        },
        {
          _tag: "LiveFolder",
          title: "Reviews",
          source: { _tag: "GitHub", query: "review-requested" },
          sort: "oldest",
        },
        {
          _tag: "LiveFolder",
          title: "Mail",
          source: { _tag: "Gmail", accountIndex: 1, label: "Work" },
          sort: "newest",
        },
      ],
      flattenedFolders: 0,
      temporaryTabs: 0,
    })
  })

  it("moves the contents of a folder nested deeper than allowed into the deepest allowed folder, in place", () => {
    const space = spaceWith([
      folder("One", [pin("A"), folder("Two", [pin("B"), folder("Three", [pin("C")]), pin("D")])]),
    ])

    const planned = planSpace(space, twoLevels)

    expect([planned.pinned, planned.flattenedFolders]).toStrictEqual([
      [
        {
          _tag: "Folder",
          title: "One",
          icon: null,
          children: [
            { _tag: "Pin", title: "A", url: "https://a.example/" },
            {
              _tag: "Folder",
              title: "Two",
              icon: null,
              children: [
                { _tag: "Pin", title: "B", url: "https://b.example/" },
                { _tag: "Pin", title: "C", url: "https://c.example/" },
                { _tag: "Pin", title: "D", url: "https://d.example/" },
              ],
            },
          ],
        },
      ],
      1,
    ])
  })

  it("while folders can't hold folders, keeps one level and counts every folder below it", () => {
    const space = spaceWith([folder("One", [folder("Two", [folder("Three", [pin("C")])])])])

    const planned = planSpace(space, oneLevel)

    expect([planned.pinned, planned.flattenedFolders]).toStrictEqual([
      [
        {
          _tag: "Folder",
          title: "One",
          icon: null,
          children: [{ _tag: "Pin", title: "C", url: "https://c.example/" }],
        },
      ],
      2,
    ])
  })

  it("drops a folder icon this Katip doesn't know", () => {
    const space = spaceWith([
      { type: "folder", title: "Odd", icon: "icon-from-the-future", children: [] },
    ])

    expect(planSpace(space, twoLevels).pinned).toStrictEqual([
      { _tag: "Folder", title: "Odd", icon: null, children: [] },
    ])
  })

  it("counts the temporary tabs it leaves behind", () => {
    const space = spaceWith(
      [],
      [
        { title: "News", url: "https://news.example/" },
        { title: "Search", url: "https://search.example/" },
      ],
    )

    expect(planSpace(space, twoLevels).temporaryTabs).toBe(2)
  })
})

describe("planFavorites", () => {
  it("leaves out pages already open as Favorites, and lists each page once", () => {
    const planned = planFavorites(
      [
        { title: "Mail", url: "https://mail.example/" },
        { title: "Calendar", url: "https://calendar.example/" },
        { title: "Mail again", url: "https://mail.example/" },
        { title: "Music", url: "https://music.example/" },
      ],
      new Set(["https://calendar.example/"]),
    )

    expect(planned).toStrictEqual({
      toOpen: [
        { title: "Mail", url: "https://mail.example/" },
        { title: "Music", url: "https://music.example/" },
      ],
      alreadyOpen: 1,
    })
  })
})

describe("planImport", () => {
  it("sums up what it adds and what it leaves out", () => {
    const document = documentWith(
      [
        spaceWith(
          [
            pin("A"),
            folder("One", [folder("Two", [folder("Three", [pin("B")])])]),
            {
              type: "split",
              items: [
                { type: "pin", title: "L", url: "https://l.example/" },
                { type: "pin", title: "R", url: "https://r.example/" },
              ],
            },
          ],
          [{ title: "News", url: "https://news.example/" }],
        ),
        {
          ...spaceWith([
            {
              type: "liveFolder",
              title: "Mentions",
              source: { kind: "github", query: "mentioned" },
              sort: "newest",
            },
          ]),
          id: "second",
        },
      ],
      [
        { title: "Mail", url: "https://mail.example/" },
        { title: "Calendar", url: "https://calendar.example/" },
      ],
    )

    const { summary } = planImport(document, {
      rule: twoLevels,
      openFavoriteUrls: new Set(["https://mail.example/"]),
    })

    expect(summary).toStrictEqual({
      spaces: 2,
      pins: 2,
      folders: 2,
      splits: 1,
      liveFolders: 1,
      favorites: 1,
      favoritesAlreadyOpen: 1,
      flattenedFolders: 1,
      temporaryTabs: 1,
    })
  })
})
