import { describe, expect, it } from "vitest"
import { downloadKindOf, searchDownloads } from "./download-search"
import { DownloadId, type Download } from "./downloads"

const download = (id: number, fileName: string, url: string, mime = ""): Download => ({
  id: DownloadId.make(id),
  fileName,
  url,
  mime,
  startedAt: id,
  progress: { _tag: "Complete", bytes: 1024 },
})

describe("downloadKindOf", () => {
  it.each([
    ["holiday.JPG", "Image"],
    ["talk.mov", "Video"],
    ["song.flac", "Audio"],
    ["report.pdf", "Document"],
    ["budget.xlsx", "Document"],
    ["notes.md", "Document"],
    ["release.tar.gz", "Archive"],
    ["installer.dmg", "Archive"],
    ["setup.exe", "Other"],
  ] as const)("takes %s for a file of the %s kind by its extension", (fileName, kind) => {
    expect(downloadKindOf({ fileName, mime: "" })).toBe(kind)
  })

  it("goes by the MIME type when the name has no extension it knows", () => {
    expect([
      downloadKindOf({ fileName: "download", mime: "image/png" }),
      downloadKindOf({ fileName: "clip", mime: "video/mp4" }),
      downloadKindOf({ fileName: "episode", mime: "audio/mpeg; codecs=mp3" }),
      downloadKindOf({ fileName: "letter", mime: "application/vnd.oasis.opendocument.text" }),
      downloadKindOf({ fileName: "bundle", mime: "application/x-7z-compressed" }),
      downloadKindOf({ fileName: "blob", mime: "application/octet-stream" }),
    ]).toStrictEqual(["Image", "Video", "Audio", "Document", "Archive", "Other"])
  })

  it("believes the extension over a MIME type that calls an Office document a zip", () => {
    expect(downloadKindOf({ fileName: "slides.pptx", mime: "application/zip" })).toBe("Document")
  })
})

describe("searchDownloads", () => {
  const report = download(1, "Quarterly report.pdf", "https://docs.example.com/q3.pdf")
  const photo = download(2, "IMG_4821.HEIC", "https://www.photos.example.net/IMG_4821.HEIC")
  const archive = download(3, "katip-1.9.0.zip", "https://github.com/qaynam/Katip/archive.zip")
  const all = [report, photo, archive]

  const namesOf = (found: ReadonlyArray<Download>) => found.map(({ fileName }) => fileName)

  it("lists every download, in the order given, for no query and every kind", () => {
    expect(namesOf(searchDownloads(all, "  ", "All"))).toStrictEqual(namesOf(all))
  })

  it("finds downloads by their file name, ignoring case", () => {
    expect(namesOf(searchDownloads(all, "QUARTERLY", "All"))).toStrictEqual([
      "Quarterly report.pdf",
    ])
  })

  it("finds downloads by the site they came from, without www.", () => {
    expect(namesOf(searchDownloads(all, "photos.example", "All"))).toStrictEqual(["IMG_4821.HEIC"])
  })

  it("needs every word to be found, in the name or the site", () => {
    expect([
      namesOf(searchDownloads(all, "report docs", "All")),
      namesOf(searchDownloads(all, "report github", "All")),
    ]).toStrictEqual([["Quarterly report.pdf"], []])
  })

  it("forgives a typo in a longer word", () => {
    expect(namesOf(searchDownloads(all, "quartelry", "All"))).toStrictEqual([
      "Quarterly report.pdf",
    ])
  })

  it("lists only the downloads of the chosen kind", () => {
    expect([
      namesOf(searchDownloads(all, "", "Image")),
      namesOf(searchDownloads(all, "", "Archive")),
      namesOf(searchDownloads(all, "report", "Image")),
    ]).toStrictEqual([["IMG_4821.HEIC"], ["katip-1.9.0.zip"], []])
  })
})
