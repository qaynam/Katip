import { Result } from "effect"
import { describe, expect, it } from "vitest"
import {
  decodeExportFile,
  encodeExportFile,
  type LatestExport,
  MalformedExport,
  NewerExportVersion,
  NotKatipExport,
} from "./export-file"
import exportV1 from "./fixtures/export-v1.json?raw"

const exportV1Document: LatestExport = {
  format: "katip.export",
  version: 1,
  exportedAt: "2026-11-02T03:04:05.000Z",
  generator: { name: "Katip", version: "0.1.0" },
  spaces: [
    {
      id: "8c0f3a52-1d4e-4f0b-9a57-2f6e0c4d9b11",
      name: "Home",
      theme: { mode: "auto", colors: [{ hue: 212.5, chroma: 0.42 }], intensity: 0.7, grain: 0.2 },
      pinned: [
        { type: "pin", title: "Inbox", url: "https://mail.example.com/inbox" },
        {
          type: "folder",
          title: "Reading",
          icon: "bookmark",
          children: [
            { type: "pin", title: "Effect Documentation", url: "https://effect.website/docs" },
            {
              type: "folder",
              title: "Recipes",
              icon: null,
              children: [
                {
                  type: "pin",
                  title: "Weeknight Dinners",
                  url: "https://recipes.example.com/weeknight",
                },
              ],
            },
          ],
        },
        {
          type: "split",
          items: [
            { type: "pin", title: "Design Doc", url: "https://docs.example.com/design" },
            { type: "pin", title: "Issue Tracker", url: "https://tracker.example.com/board" },
          ],
        },
        {
          type: "liveFolder",
          title: "Gmail",
          source: { kind: "gmail", accountIndex: 0, label: null },
          sort: "newest",
        },
      ],
      tabs: [
        { title: "Weather — Tokyo", url: "https://weather.example.com/tokyo" },
        { title: "New Tab", url: "chrome://newtab/" },
      ],
    },
    {
      id: "f2b6c1e8-7a3d-4c59-b0e4-61d8a9f3c2a7",
      name: "Work",
      theme: {
        mode: "dark",
        colors: [
          { hue: 145, chroma: 0.6 },
          { hue: 200, chroma: 0.35 },
        ],
        intensity: 0.55,
        grain: 0.1,
      },
      pinned: [
        {
          type: "liveFolder",
          title: "Review requests",
          source: { kind: "github", query: "review-requested" },
          sort: "source",
        },
        {
          type: "folder",
          title: "Projects",
          icon: "code",
          children: [
            { type: "pin", title: "katip-dev/katip", url: "https://github.com/katip-dev/katip" },
          ],
        },
      ],
      tabs: [{ title: "Pull requests", url: "https://github.com/pulls" }],
    },
  ],
  favorites: [
    { title: "Calendar", url: "https://calendar.example.com/" },
    { title: "Music", url: "https://music.example.com/" },
  ],
  settings: {
    newTabsOnTop: true,
    showAllOpenTabsInCollapsedFolders: false,
    syncTabGroups: true,
    autoArchive: { enabled: true, idleMinutes: 720 },
    defaultSpaceId: "8c0f3a52-1d4e-4f0b-9a57-2f6e0c4d9b11",
    locale: "ja",
    pageShortcuts: { copyUrl: true, copyMarkdownLink: false },
  },
}

const encoded = (document: LatestExport) => Result.getOrThrow(encodeExportFile(document))

const withChanges = (change: (json: Record<string, unknown>) => unknown) =>
  JSON.stringify(change(JSON.parse(exportV1) as Record<string, unknown>))

const failureOf = <A, E>(result: Result.Result<A, E>) =>
  Result.isFailure(result) ? result.failure : undefined

describe("writing", () => {
  it("writes JSON marked with the latest version, with each node's kind in type", () => {
    const written = JSON.parse(encoded(exportV1Document)) as LatestExport

    expect([
      written.format,
      written.version,
      written.spaces[0]?.pinned.map((node) => node.type),
    ]).toStrictEqual(["katip.export", 1, ["pin", "folder", "split", "liveFolder"]])
  })

  it("indents the JSON by two spaces so people can read it too", () => {
    const written = encoded(exportV1Document)

    expect(written).toBe(JSON.stringify(JSON.parse(written), null, 2))
  })

  it("reads a written file back into the document it was written from", () => {
    expect(decodeExportFile(encoded(exportV1Document))).toStrictEqual(
      Result.succeed(exportV1Document),
    )
  })

  it("fails without writing a document holding a value that doesn't fit the version's shape", () => {
    const outOfRange: LatestExport = {
      ...exportV1Document,
      spaces: exportV1Document.spaces.map((space) => ({
        ...space,
        theme: { ...space.theme, intensity: 1.5 },
      })),
    }

    expect(Result.isFailure(encodeExportFile(outOfRange))).toBe(true)
  })
})

describe("reading", () => {
  it("reads the sample file written in v1 as a document of the latest version", () => {
    expect(decodeExportFile(exportV1)).toStrictEqual(Result.succeed(exportV1Document))
  })

  it("reads only the known fields of a file with unknown ones added", () => {
    const withUnknownFields = withChanges((json) => ({
      ...json,
      archive: [{ title: "Closed tab", url: "https://example.com/" }],
      spaces: (json["spaces"] as ReadonlyArray<Record<string, unknown>>).map((space) => ({
        ...space,
        emoji: "🏠",
        pinned: (space["pinned"] as ReadonlyArray<object>).map((node) => ({
          ...node,
          color: "blue",
        })),
      })),
      settings: { ...(json["settings"] as object), theme: "sepia" },
    }))

    expect(decodeExportFile(withUnknownFields)).toStrictEqual(Result.succeed(exportV1Document))
  })

  it("rejects a file of a newer version than this Katip with an error that asks for an update", () => {
    const fromFuture = withChanges((json) => ({ ...json, version: 2, spaces: "a changed shape" }))

    expect(failureOf(decodeExportFile(fromFuture))).toStrictEqual(
      new NewerExportVersion({ version: 2, latestVersion: 1 }),
    )
  })

  it.each([
    ["whose format is another app's", JSON.stringify({ format: "other.backup", version: 1 })],
    ["without a format", JSON.stringify({ version: 1, spaces: [] })],
    ["that is a JSON array", "[]"],
    ["that isn't JSON", "<html></html>"],
  ])("rejects a file %s as not a Katip export file", (_, content) => {
    expect(failureOf(decodeExportFile(content))).toStrictEqual(new NotKatipExport())
  })

  it.each([
    ["without a version", withChanges(({ version: _, ...json }) => json)],
    ["whose version isn't an integer", withChanges((json) => ({ ...json, version: "1" }))],
    ["whose version is below 1", withChanges((json) => ({ ...json, version: 0 }))],
    [
      "whose content doesn't fit the version's shape",
      withChanges((json) => ({ ...json, spaces: [{ name: "Home" }] })),
    ],
  ])("rejects a file %s as a malformed export file", (_, content) => {
    expect(failureOf(decodeExportFile(content))).toBeInstanceOf(MalformedExport)
  })
})
