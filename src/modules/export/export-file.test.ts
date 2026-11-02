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

describe("書き出し", () => {
  it("最新の版の印を付け、ノードの種類を type で示した JSON を書く", () => {
    const written = JSON.parse(encoded(exportV1Document)) as LatestExport

    expect([
      written.format,
      written.version,
      written.spaces[0]?.pinned.map((node) => node.type),
    ]).toStrictEqual(["katip.export", 1, ["pin", "folder", "split", "liveFolder"]])
  })

  it("人が開いても読めるよう、2 文字ずつ字下げした JSON で書く", () => {
    const written = encoded(exportV1Document)

    expect(written).toBe(JSON.stringify(JSON.parse(written), null, 2))
  })

  it("書いたファイルを読むと、書く前の文書に戻る", () => {
    expect(decodeExportFile(encoded(exportV1Document))).toStrictEqual(
      Result.succeed(exportV1Document),
    )
  })

  it("版の形に合わない値を持つ文書は書かずに失敗する", () => {
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

describe("読み込み", () => {
  it("v1 で書いた見本のファイルを、最新の版の文書として読める", () => {
    expect(decodeExportFile(exportV1)).toStrictEqual(Result.succeed(exportV1Document))
  })

  it("知らない項目が増えていても、知っている項目だけを読む", () => {
    const withUnknownFields = withChanges((json) => ({
      ...json,
      archive: [{ title: "閉じたタブ", url: "https://example.com/" }],
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

  it("この Katip より新しい版のファイルは、Katip の更新を促すエラーで断る", () => {
    const fromFuture = withChanges((json) => ({ ...json, version: 2, spaces: "形が変わった" }))

    expect(failureOf(decodeExportFile(fromFuture))).toStrictEqual(
      new NewerExportVersion({ version: 2, latestVersion: 1 }),
    )
  })

  it.each([
    ["format が別のアプリのもの", JSON.stringify({ format: "other.backup", version: 1 })],
    ["format が無い", JSON.stringify({ version: 1, spaces: [] })],
    ["JSON の配列", "[]"],
    ["JSON でない", "<html></html>"],
  ])("%s ファイルは、Katip の書き出しファイルではないとして断る", (_, content) => {
    expect(failureOf(decodeExportFile(content))).toStrictEqual(new NotKatipExport())
  })

  it.each([
    ["版が無い", withChanges(({ version: _, ...json }) => json)],
    ["版が整数でない", withChanges((json) => ({ ...json, version: "1" }))],
    ["版が 1 より小さい", withChanges((json) => ({ ...json, version: 0 }))],
    ["中身が版の形に合わない", withChanges((json) => ({ ...json, spaces: [{ name: "Home" }] }))],
  ])("%s ファイルは、壊れた書き出しファイルとして断る", (_, content) => {
    expect(failureOf(decodeExportFile(content))).toBeInstanceOf(MalformedExport)
  })
})
