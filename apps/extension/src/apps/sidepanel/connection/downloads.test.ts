import { describe, expect, it } from "vitest"
import { downloadOf } from "./downloads"

const item = (
  overrides: Partial<chrome.downloads.DownloadItem> = {},
): chrome.downloads.DownloadItem => ({
  id: 7,
  url: "https://files.example.com/get?id=7",
  finalUrl: "https://cdn.example.com/report.pdf",
  referrer: "",
  filename: "/Users/someone/Downloads/report.pdf",
  incognito: false,
  danger: "safe",
  mime: "application/pdf",
  startTime: "2026-11-16T10:00:00.000Z",
  state: "complete",
  paused: false,
  canResume: false,
  bytesReceived: 2048,
  totalBytes: 2048,
  fileSize: 2048,
  exists: true,
  ...overrides,
})

describe("a download read from the browser", () => {
  it("is named after its file and comes from where it was finally fetched", () => {
    const download = downloadOf(item())

    expect([download.id, download.fileName, download.url, download.startedAt]).toStrictEqual([
      7,
      "report.pdf",
      "https://cdn.example.com/report.pdf",
      Date.parse("2026-11-16T10:00:00.000Z"),
    ])
  })

  it("takes its name from a Windows path too", () => {
    expect(
      downloadOf(item({ filename: "C:\\Users\\someone\\Downloads\\report.pdf" })).fileName,
    ).toBe("report.pdf")
  })

  it("goes by its URL while the browser hasn't chosen where to save it", () => {
    expect(downloadOf(item({ filename: "", finalUrl: "" })).fileName).toBe(
      "https://files.example.com/get?id=7",
    )
  })

  it("is complete with the file's size, or deleted when the file is gone", () => {
    expect([
      downloadOf(item()).progress,
      downloadOf(item({ exists: false })).progress,
    ]).toStrictEqual([{ _tag: "Complete", bytes: 2048 }, { _tag: "Deleted" }])
  })

  it("is running or paused with how far it got, and no whole size when the server gave none", () => {
    const running = { state: "in_progress", bytesReceived: 512, totalBytes: 0 } as const

    expect([
      downloadOf(item(running)).progress,
      downloadOf(item({ ...running, paused: true, canResume: true })).progress,
    ]).toStrictEqual([
      { _tag: "InProgress", receivedBytes: 512, totalBytes: null },
      { _tag: "Paused", receivedBytes: 512, totalBytes: null, canResume: true },
    ])
  })

  it("is canceled when the person canceled it, and failed when it broke off otherwise", () => {
    expect([
      downloadOf(item({ state: "interrupted", error: "USER_CANCELED" })).progress,
      downloadOf(item({ state: "interrupted", error: "NETWORK_FAILED", canResume: true })).progress,
    ]).toStrictEqual([{ _tag: "Canceled" }, { _tag: "Failed", canResume: true }])
  })
})
